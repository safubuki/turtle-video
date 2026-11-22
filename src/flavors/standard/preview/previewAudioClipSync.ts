/**
 * @file previewAudioClipSync.ts (standard flavor)
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description BGM クリップ／ナレーション（音声クリップ）の <audio> 要素を、
 * プレビュー再生中のタイムラインへ追従させる判定（standard preview 専用）。
 *
 * 従来は「ずれが 0.5 秒を超えたら一時停止 → シーク → 再生」を毎フレーム評価していた。
 * シーク中は currentTime がシーク先で止まったままタイムラインだけ進むため、
 * シーク（＋再生開始）に 0.5 秒以上かかる環境では、完了前に次のシークが重なり続けて
 * 永久に鳴らず、区間全体が無音になった。動画ファイルを BGM にした場合は音声ファイルより
 * シークが重く、再生中に一括音量などを操作してメインスレッドが詰まると起きやすい。
 *
 * ここでは次の 3 点でシークの連鎖を断つ。
 * 1. 発行済みのシークが終わるまで、新しいシークを重ねない。
 * 2. 再同期は「今の位置」ではなく、実測したシーク＋再生開始の所要時間ぶん先を狙う。
 *    早く終わったらタイムラインが追いつくまで待ってから鳴らす（冒頭を飛ばさない）。
 * 3. 区間の開始前に、停止中の要素を区間の頭へ先にシークしておく（区間に入った瞬間のシークをなくす）。
 *
 * 書き出し中の経路はこの判定を使わない（呼び出し側で従来処理のまま）。
 */

/** これを超えるずれは再シークで合わせる（従来値を維持） */
export const PREVIEW_AUDIO_CLIP_RESYNC_THRESHOLD_SEC = 0.5;
/** 区間開始のこの秒数前から、停止中の要素を区間の頭へ先にシークしておく */
export const PREVIEW_AUDIO_CLIP_PREROLL_SEC = 2;
/** 先回りシークの上限（極端に遅い環境でも区間の大半を飛ばさない） */
export const PREVIEW_AUDIO_CLIP_MAX_SEEK_LEAD_SEC = 1.5;
/** play() 後に currentTime が進み始めるのを待つ上限 */
export const PREVIEW_AUDIO_CLIP_MAX_PLAY_START_WAIT_MS = 1500;

/** 頭出し済みとみなす位置の誤差 */
const PREROLL_POSITION_TOLERANCE_SEC = 0.05;
/** 先回り位置から鳴らし始めてよい先行量の余裕 */
const EARLY_START_TOLERANCE_SEC = 0.03;
/** 区間の終端ぎりぎりへはシークしない（終端を越えると ended 扱いになるため） */
const END_MARGIN_SEC = 0.05;
/** 所要時間の 1 回分の計測上限（停止中の放置時間などを学習しない） */
const MAX_LATENCY_SAMPLE_SEC = 3;
const INITIAL_SEEK_LATENCY_SEC = 0.15;
const INITIAL_PLAY_LATENCY_SEC = 0.05;
/** 再生開始で currentTime が進んだとみなす量 */
const PLAYBACK_PROGRESS_EPSILON_SEC = 0.001;
/** HTMLMediaElement.HAVE_CURRENT_DATA */
const MIN_READY_STATE_FOR_PLAY = 2;
/** HTMLMediaElement.HAVE_METADATA */
const MIN_READY_STATE_FOR_SEEK = 1;

/** 要素ごとに保持する追従状態（シーク・再生開始の所要時間の学習値を含む） */
export interface PreviewAudioClipSyncState {
  /** この判定が発行したシークの発行時刻。完了を観測したら null に戻す */
  seekIssuedAtMs: number | null;
  /** シークにかかる時間の推定値（秒） */
  seekLatencySec: number;
  /** この判定が要求した play() の要求時刻。実際に進み始めたら null に戻す */
  playRequestedAtMs: number | null;
  /** play() を要求した時点の currentTime（進み始めの検出用） */
  playRequestedFromSec: number;
  /** play() から実際に進み始めるまでの時間の推定値（秒） */
  playLatencySec: number;
}

/** 判定に必要な要素の状態（HTMLMediaElement の一部） */
export interface PreviewAudioClipElementState {
  currentTime: number;
  paused: boolean;
  seeking: boolean;
  ended: boolean;
  readyState: number;
}

export interface PreviewAudioClipSyncDecision {
  /** null 以外ならこの位置へシークする */
  seekTo: number | null;
  /** play() を呼ぶ */
  play: boolean;
  /** pause() を呼ぶ */
  pause: boolean;
  /** このフレームで音を出してよいか（false なら gain を 0 へ） */
  audible: boolean;
}

export function createPreviewAudioClipSyncState(): PreviewAudioClipSyncState {
  return {
    seekIssuedAtMs: null,
    seekLatencySec: INITIAL_SEEK_LATENCY_SEC,
    playRequestedAtMs: null,
    playRequestedFromSec: 0,
    playLatencySec: INITIAL_PLAY_LATENCY_SEC,
  };
}

/**
 * 計測値を推定値へ反映する。遅い環境にはすぐ合わせ、速くなったときはゆっくり戻す
 * （推定が短すぎると先回りが足りず、再シークを繰り返すため）。
 */
function blendLatency(currentSec: number, measuredSec: number): number {
  const sample = Math.max(0, Math.min(MAX_LATENCY_SAMPLE_SEC, measuredSec));
  return sample >= currentSec ? sample : currentSec * 0.5 + sample * 0.5;
}

/**
 * 毎フレーム（区間の内外を問わず）判定の前に呼び、発行済みのシーク・play() の完了を観測して
 * 所要時間を学習する。
 */
export function observePreviewAudioClipSync(
  state: PreviewAudioClipSyncState,
  element: PreviewAudioClipElementState,
  nowMs: number,
): void {
  if (state.seekIssuedAtMs !== null && !element.seeking) {
    state.seekLatencySec = blendLatency(state.seekLatencySec, (nowMs - state.seekIssuedAtMs) / 1000);
    state.seekIssuedAtMs = null;
  }

  if (state.playRequestedAtMs === null) {
    return;
  }
  if (element.paused) {
    // play() が拒否された／別経路で止められた。次の判定で改めて要求する
    state.playRequestedAtMs = null;
    return;
  }
  if (Math.abs(element.currentTime - state.playRequestedFromSec) > PLAYBACK_PROGRESS_EPSILON_SEC) {
    state.playLatencySec = blendLatency(state.playLatencySec, (nowMs - state.playRequestedAtMs) / 1000);
    state.playRequestedAtMs = null;
    return;
  }
  if (nowMs - state.playRequestedAtMs >= PREVIEW_AUDIO_CLIP_MAX_PLAY_START_WAIT_MS) {
    // 進まないまま上限を過ぎたら待つのをやめ、通常のずれ判定へ戻す
    state.playRequestedAtMs = null;
  }
}

/**
 * 停止中のプレビュー描画で呼び、計測途中の状態を捨てる。
 * 停止していた時間をシーク・再生開始の所要時間として学習しないため。
 */
export function resetPreviewAudioClipSyncPending(state: PreviewAudioClipSyncState): void {
  state.seekIssuedAtMs = null;
  state.playRequestedAtMs = null;
}

/** 頭出しなど、判定の外で発行したシークの所要時間も学習対象にする */
export function notePreviewAudioClipSeekIssued(state: PreviewAudioClipSyncState, nowMs: number): void {
  state.seekIssuedAtMs = nowMs;
}

/**
 * 区間内・再生中の 1 フレーム分の追従操作を決める。
 * `targetSourceTime` はタイムラインから求めた「今鳴っているべき音源内の位置」。
 */
export function resolvePreviewAudioClipSyncDecision(
  state: PreviewAudioClipSyncState,
  params: {
    nowMs: number;
    element: PreviewAudioClipElementState;
    targetSourceTime: number;
    /** 有効区間の音源内終端（trimStart + 有効再生長） */
    endSourceTime: number;
    /** 復帰待ちなどで、このフレームは音を止める */
    hold: boolean;
  },
): PreviewAudioClipSyncDecision {
  const { element } = params;

  if (params.hold) {
    return { seekTo: null, play: false, pause: !element.paused, audible: false };
  }

  // シークを重ねると、所要時間より短い間隔で上書きされ続けて永久に終わらない。完了を待つ。
  if (element.seeking) {
    return { seekTo: null, play: false, pause: false, audible: false };
  }

  // play() 後、実際に進み始めるまでは待つ（止まって見える間をずれと誤認して再シークしない）
  if (state.playRequestedAtMs !== null && !element.paused) {
    return { seekTo: null, play: false, pause: false, audible: true };
  }

  const drift = element.currentTime - params.targetSourceTime;
  if (Math.abs(drift) > PREVIEW_AUDIO_CLIP_RESYNC_THRESHOLD_SEC) {
    // 今の位置へシークすると、終わった時点でまた所要時間ぶん遅れている。その分だけ先を狙う。
    const lead = Math.min(
      PREVIEW_AUDIO_CLIP_MAX_SEEK_LEAD_SEC,
      state.seekLatencySec + state.playLatencySec,
    );
    const latestSeekable = Math.max(params.targetSourceTime, params.endSourceTime - END_MARGIN_SEC);
    const seekTo = Math.max(0, Math.min(params.targetSourceTime + lead, latestSeekable));
    state.seekIssuedAtMs = params.nowMs;
    state.playRequestedAtMs = null;
    return { seekTo, play: false, pause: !element.paused, audible: false };
  }

  if (!element.paused) {
    return { seekTo: null, play: false, pause: false, audible: true };
  }

  // 終端で止まった要素へ play() すると先頭から鳴り直すため、鳴らさない
  if (element.ended || element.readyState < MIN_READY_STATE_FOR_PLAY) {
    return { seekTo: null, play: false, pause: false, audible: false };
  }

  // 先回りシークが早く終わった。再生開始の所要時間を見込んでも先行しすぎなら、
  // タイムラインが追いつくまで待ってから鳴らす（先回りした分の冒頭を飛ばさない）。
  if (drift > state.playLatencySec + EARLY_START_TOLERANCE_SEC) {
    return { seekTo: null, play: false, pause: false, audible: false };
  }

  state.playRequestedAtMs = params.nowMs;
  state.playRequestedFromSec = element.currentTime;
  return { seekTo: null, play: true, pause: false, audible: true };
}

/**
 * 区間の開始前に、停止中の要素を区間の頭（trimStart）へ先にシークしておくべきなら、その位置を返す。
 * 区間に入った瞬間のシークがなくなり、重い素材でも頭から鳴らし始められる。
 */
export function resolvePreviewAudioClipPrerollSeek(params: {
  /** 区間開始までの残り時間（秒）。開始済み・終了後は 0 以下 */
  timeUntilStartSec: number;
  trimStart: number;
  element: PreviewAudioClipElementState;
}): number | null {
  const { element } = params;
  if (!(params.timeUntilStartSec > 0) || params.timeUntilStartSec > PREVIEW_AUDIO_CLIP_PREROLL_SEC) {
    return null;
  }
  if (!element.paused || element.seeking || element.readyState < MIN_READY_STATE_FOR_SEEK) {
    return null;
  }
  if (Math.abs(element.currentTime - params.trimStart) <= PREROLL_POSITION_TOLERANCE_SEC) {
    return null;
  }
  return Math.max(0, params.trimStart);
}
