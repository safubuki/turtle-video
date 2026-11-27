/**
 * @file playbackSpeed.ts
 * @description 動画カード再生速度（0.5〜8.0・0.05刻み）の正規化・タイムライン/ソース時刻変換・速度バッジ描画。
 * Docs/specs/2026-08-01_video-playback-speed.md
 */
import type { MediaItem, SpeedBadgeLabelStyle, VideoPlaybackSpeed } from '../types';

/** スライダーの下限（スロー）。0.1 は実用性が低いため 0.5 を下限にする */
export const MIN_VIDEO_PLAYBACK_SPEED = 0.5;
/** スライダーの上限（従来の 8x を維持） */
export const MAX_VIDEO_PLAYBACK_SPEED = 8;
/** スライダー / ステッパーの刻み */
export const VIDEO_PLAYBACK_SPEED_STEP = 0.05;

/** よく使う倍率のショートカット（スライダー本体とは別に任意で置く） */
export const VIDEO_PLAYBACK_SPEEDS: readonly VideoPlaybackSpeed[] = [0.5, 1, 2, 4, 8];

export const DEFAULT_VIDEO_PLAYBACK_SPEED: VideoPlaybackSpeed = 1;

/** バッジ文言の既定（日本語「N倍速」） */
export const DEFAULT_SPEED_BADGE_LABEL_STYLE: SpeedBadgeLabelStyle = 'ja';

/** 四隅プリセットの角からの余白（中心 %）。横・縦とも同じ距離 */
export const SPEED_BADGE_CORNER_INSET_PERCENT = 9;

/** バッジ既定位置（右上寄り・中心 %） */
export const DEFAULT_SPEED_BADGE_POSITION = {
  x: 100 - SPEED_BADGE_CORNER_INSET_PERCENT,
  y: SPEED_BADGE_CORNER_INSET_PERCENT,
} as const;

export type SpeedBadgePositionPreset =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToPlaybackSpeedStep(value: number): number {
  const stepped = Math.round(value / VIDEO_PLAYBACK_SPEED_STEP) * VIDEO_PLAYBACK_SPEED_STEP;
  return Number(stepped.toFixed(2));
}

/**
 * 未知値・旧データを 0.50〜8.00（0.05刻み）へ正規化する。
 * 旧プロジェクトの 1/2/4/8 や 0.1 刻みはそのまま通る。0.5 未満は 0.5。不正値は 1。
 */
export function normalizeVideoPlaybackSpeed(value: unknown): VideoPlaybackSpeed {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_VIDEO_PLAYBACK_SPEED;
  return Math.min(
    MAX_VIDEO_PLAYBACK_SPEED,
    Math.max(MIN_VIDEO_PLAYBACK_SPEED, roundToPlaybackSpeedStep(n)),
  );
}

/** 速度バッジ・見出し向けの簡潔な倍率表記（2 / 1.5 / 1.25 のように 0.05 単位を崩さず表示） */
export function formatPlaybackSpeedValue(speed: unknown): string {
  const s = normalizeVideoPlaybackSpeed(speed);
  return Number(s.toFixed(2)).toString();
}

/** 数値入力欄向けの小数 2 桁固定表記（例: 2.00 / 1.05 / 0.50） */
export function formatPlaybackSpeedInputValue(speed: unknown): string {
  return normalizeVideoPlaybackSpeed(speed).toFixed(2);
}

/**
 * 元動画上の有効尺（trim 後・速度適用前）。
 */
export function getVideoSourceClipDuration(item: {
  trimStart?: number;
  trimEnd?: number;
  originalDuration?: number;
}): number {
  const start = Number.isFinite(item.trimStart) ? Math.max(0, item.trimStart as number) : 0;
  let end = Number.isFinite(item.trimEnd) ? (item.trimEnd as number) : start;
  if (end <= start) {
    const original = Number.isFinite(item.originalDuration)
      ? Math.max(0, item.originalDuration as number)
      : 0;
    if (original > start) end = original;
  }
  return Math.max(0, end - start);
}

/**
 * 再生中の「いまの速さ」（`<video>.playbackRate` や壁時計の割り算に使う値）を正規化する。
 * なめらか接続の途中段（例: 0.967 倍）を 0.1 刻みへ丸めると段差が消えるため、丸めずに
 * 0.5〜8 の範囲へ収めるだけにする。0.1 刻みの設定値はそのまま通る。
 */
export function normalizeVideoPlaybackRateValue(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_VIDEO_PLAYBACK_SPEED;
  return Number(clamp(n, MIN_VIDEO_PLAYBACK_SPEED, MAX_VIDEO_PLAYBACK_SPEED).toFixed(4));
}

// ---------------------------------------------------------------------------
// 速度のなめらか接続（スピードランプ）
// ---------------------------------------------------------------------------

/** なめらか接続にかける時間（タイムライン秒）の選択肢。フェード時間と同じ 3 段 */
export const SPEED_RAMP_DURATION_STOPS = [0.5, 1, 2] as const;
export const DEFAULT_SPEED_RAMP_DURATION_SEC = 1;
/** これ未満の速度差は「同じ速さ」とみなし、なめらか接続をしない */
export const SPEED_RAMP_MIN_SPEED_DIFF = 0.05;
/** 1 段あたりの速度比の目安（4%）。これ以下の差なら目で見て段差に気づきにくい */
const SPEED_RAMP_STEP_RATIO = 1.04;
/** 1 段の最短時間（タイムライン秒）。rate の切り替えを詰めすぎない（13-286 の音の乱れ対策） */
const SPEED_RAMP_MIN_STEP_SEC = 0.1;
const SPEED_RAMP_MIN_STEPS = 2;
const SPEED_RAMP_MAX_STEPS = 12;

export function normalizeSpeedRampDuration(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SPEED_RAMP_DURATION_SEC;
  if (n < 0.75) return 0.5;
  if (n < 1.5) return 1;
  return 2;
}

/** なめらか接続の 1 段（その段のあいだは一定の速さで進む） */
export interface VideoSpeedRampStep {
  speed: number;
  /** クリップ先頭からのタイムライン秒 */
  timelineStart: number;
  timelineEnd: number;
  /** trimStart からのソース秒 */
  sourceStart: number;
}

/**
 * クリップ先頭で「前の動画の速さ → このクリップの速さ」へ段階的に移る区間。
 * 段ごとに一定速度の折れ線で、プレビュー・書き出し・シーク・音声の全経路が同じ段を使う。
 */
export interface VideoSpeedRamp {
  fromSpeed: number;
  toSpeed: number;
  steps: readonly VideoSpeedRampStep[];
  /** なめらか接続の区間のタイムライン尺 */
  timelineDuration: number;
  /** なめらか接続の区間で進むソース尺 */
  sourceDuration: number;
}

/**
 * 「前の速さ → 目標の速さ」の段を作る。速さは対数で等分し（0.8→1 と 1→1.25 を同じ感覚にする）、
 * 両端を除いた中間値だけを並べる。クリップが短くて段の合計ソース尺が足りないときは、
 * クリップ全体を段に充てる（目標の速さまで届かずに終わる）。
 */
export function buildVideoSpeedRamp(params: {
  fromSpeed: unknown;
  toSpeed: unknown;
  durationSec: unknown;
  sourceClipDuration: number;
}): VideoSpeedRamp | null {
  const fromSpeed = normalizeVideoPlaybackSpeed(params.fromSpeed);
  const toSpeed = normalizeVideoPlaybackSpeed(params.toSpeed);
  if (Math.abs(fromSpeed - toSpeed) < SPEED_RAMP_MIN_SPEED_DIFF) return null;
  const sourceClipDuration = Number.isFinite(params.sourceClipDuration)
    ? Math.max(0, params.sourceClipDuration)
    : 0;
  if (!(sourceClipDuration > 0)) return null;
  const requestedDuration = normalizeSpeedRampDuration(params.durationSec);

  const logRatio = Math.log(toSpeed / fromSpeed);
  const maxStepsByDuration = Math.max(
    SPEED_RAMP_MIN_STEPS,
    Math.floor(requestedDuration / SPEED_RAMP_MIN_STEP_SEC + 1e-9),
  );
  const stepCount = clamp(
    Math.ceil(Math.abs(logRatio) / Math.log(SPEED_RAMP_STEP_RATIO)),
    SPEED_RAMP_MIN_STEPS,
    Math.min(SPEED_RAMP_MAX_STEPS, maxStepsByDuration),
  );
  const speeds: number[] = [];
  for (let k = 0; k < stepCount; k++) {
    speeds.push(Number((fromSpeed * Math.exp(logRatio * ((k + 1) / (stepCount + 1)))).toFixed(4)));
  }
  const speedSum = speeds.reduce((sum, s) => sum + s, 0);
  let stepDuration = requestedDuration / stepCount;
  const requestedSource = stepDuration * speedSum;
  if (requestedSource > sourceClipDuration) {
    stepDuration *= sourceClipDuration / requestedSource;
  }
  if (!(stepDuration > 0)) return null;

  const steps: VideoSpeedRampStep[] = [];
  let sourceCursor = 0;
  for (let k = 0; k < stepCount; k++) {
    steps.push({
      speed: speeds[k],
      timelineStart: k * stepDuration,
      timelineEnd: (k + 1) * stepDuration,
      sourceStart: sourceCursor,
    });
    sourceCursor += stepDuration * speeds[k];
  }
  return {
    fromSpeed,
    toSpeed,
    steps,
    timelineDuration: stepDuration * stepCount,
    sourceDuration: Math.min(sourceClipDuration, sourceCursor),
  };
}

/** なめらか接続の判定に使う MediaItem のフィールド */
export interface VideoSpeedRampItemFields {
  type?: string;
  trimStart?: number;
  trimEnd?: number;
  originalDuration?: number;
  playbackSpeed?: unknown;
  speedRampIn?: boolean;
  speedRampFromSpeed?: number;
  speedRampDuration?: number;
}

const speedRampCache = new WeakMap<object, { key: string; ramp: VideoSpeedRamp | null }>();

/**
 * クリップのなめらか接続の段を返す（無効なら null）。
 * `speedRampFromSpeed` は store が直前の動画から毎回取り直す派生値（保存しない）。
 * 毎フレーム呼ばれるため、同じ内容のアイテムでは結果を使い回す。
 */
export function resolveVideoSpeedRampForItem(
  item: VideoSpeedRampItemFields | null | undefined,
): VideoSpeedRamp | null {
  if (!item || item.type === 'image' || item.speedRampIn !== true) return null;
  if (!Number.isFinite(item.speedRampFromSpeed)) return null;
  const sourceClipDuration = getVideoSourceClipDuration(item);
  const key = [
    sourceClipDuration,
    item.playbackSpeed,
    item.speedRampFromSpeed,
    item.speedRampDuration,
  ].join('|');
  const cached = speedRampCache.get(item);
  if (cached && cached.key === key) return cached.ramp;
  const ramp = buildVideoSpeedRamp({
    fromSpeed: item.speedRampFromSpeed,
    toSpeed: item.playbackSpeed,
    durationSec: item.speedRampDuration,
    sourceClipDuration,
  });
  speedRampCache.set(item, { key, ramp });
  return ramp;
}

function findSpeedRampStep(ramp: VideoSpeedRamp, localTime: number): VideoSpeedRampStep | null {
  if (!(localTime < ramp.timelineDuration)) return null;
  const steps = ramp.steps;
  const stepDuration = ramp.timelineDuration / steps.length;
  const index = clamp(Math.floor(localTime / stepDuration), 0, steps.length - 1);
  return steps[index] ?? null;
}

/** クリップ先頭からのタイムライン秒 → trimStart からのソース秒 */
export function resolveVideoSourceOffsetAtLocalTime(
  localTime: number,
  playbackSpeed: unknown,
  speedRamp?: VideoSpeedRamp | null,
): number {
  const t = Number.isFinite(localTime) ? Math.max(0, localTime) : 0;
  const speed = normalizeVideoPlaybackSpeed(playbackSpeed);
  if (!speedRamp) return t * speed;
  const step = findSpeedRampStep(speedRamp, t);
  if (step) return step.sourceStart + (t - step.timelineStart) * step.speed;
  return speedRamp.sourceDuration + (t - speedRamp.timelineDuration) * speed;
}

/** trimStart からのソース秒 → クリップ先頭からのタイムライン秒（上の逆変換） */
export function resolveVideoLocalTimeAtSourceOffset(
  sourceOffset: number,
  playbackSpeed: unknown,
  speedRamp?: VideoSpeedRamp | null,
): number {
  const src = Number.isFinite(sourceOffset) ? Math.max(0, sourceOffset) : 0;
  const speed = normalizeVideoPlaybackSpeed(playbackSpeed);
  if (!speedRamp) return src / speed;
  if (src >= speedRamp.sourceDuration) {
    return speedRamp.timelineDuration + (src - speedRamp.sourceDuration) / speed;
  }
  const steps = speedRamp.steps;
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (src >= step.sourceStart) {
      return step.timelineStart + (src - step.sourceStart) / step.speed;
    }
  }
  return 0;
}

/**
 * クリップ内のその瞬間の速さ。なめらか接続の区間では段の速さ、それ以外は設定速度。
 * `<video>.playbackRate`・追従補正・export の壁時計 dilation に使う（0.1 刻みに丸めない）。
 */
export function resolveVideoPlaybackSpeedAtLocalTime(
  localTime: number,
  playbackSpeed: unknown,
  speedRamp?: VideoSpeedRamp | null,
): number {
  const speed = normalizeVideoPlaybackSpeed(playbackSpeed);
  if (!speedRamp || !Number.isFinite(localTime)) return speed;
  return findSpeedRampStep(speedRamp, Math.max(0, localTime))?.speed ?? speed;
}

/** アイテムから直接「いまの速さ」を求める（画像は 1） */
export function resolveItemPlaybackSpeedAtLocalTime(
  item: VideoSpeedRampItemFields | null | undefined,
  localTime: number,
): number {
  if (!item || item.type === 'image') return DEFAULT_VIDEO_PLAYBACK_SPEED;
  return resolveVideoPlaybackSpeedAtLocalTime(
    localTime,
    item.playbackSpeed,
    resolveVideoSpeedRampForItem(item),
  );
}

/**
 * 直前のカードから「なめらか接続の開始速度」を決める。使えないときは undefined。
 * - 直前が動画でない（先頭・画像）: 速さの段差が無いので使わない
 * - 2 画面表示のペア（直前が自分と同時再生 / 自分が次と同時再生）: 同時に流すので使わない
 * - 速さがほぼ同じ: 変化が無いので使わない
 */
export function resolveSpeedRampFromSpeed(
  items: ReadonlyArray<Pick<VideoSpeedRampItemFields, 'type' | 'playbackSpeed'> & {
    splitCompareToNext?: unknown;
  }>,
  index: number,
): number | undefined {
  const item = items[index];
  const prev = index > 0 ? items[index - 1] : undefined;
  if (!item || item.type !== 'video' || !prev || prev.type !== 'video') return undefined;
  if (prev.splitCompareToNext || item.splitCompareToNext) return undefined;
  const fromSpeed = normalizeVideoPlaybackSpeed(prev.playbackSpeed);
  const toSpeed = normalizeVideoPlaybackSpeed(item.playbackSpeed);
  if (Math.abs(fromSpeed - toSpeed) < SPEED_RAMP_MIN_SPEED_DIFF) return undefined;
  return fromSpeed;
}

/**
 * なめらか接続の派生値（開始速度・タイムライン尺）を並び全体で取り直す。
 * 直前のカードの速度変更・並べ替え・削除・追加・保存読込のどれでも同じ結果になるよう、
 * store の更新ごとに通す。変化が無ければ同じ配列を返す。
 * なめらか接続を使っていないカードは一切触らない（従来の尺計算と完全一致）。
 */
export function syncVideoSpeedRampItems<T extends VideoSpeedRampItemFields & {
  duration: number;
  splitCompareToNext?: unknown;
}>(items: T[]): T[] {
  let changed = false;
  const next = items.map((item, index) => {
    if (item.type !== 'video') return item;
    const wantsRamp = item.speedRampIn === true;
    if (!wantsRamp && item.speedRampFromSpeed === undefined) return item;
    const fromSpeed = wantsRamp ? resolveSpeedRampFromSpeed(items, index) : undefined;
    const candidate = { ...item, speedRampFromSpeed: fromSpeed };
    const duration = computeTimelineDurationFromSource(
      getVideoSourceClipDuration(item),
      item.playbackSpeed,
      resolveVideoSpeedRampForItem(candidate),
    );
    const sameFrom = item.speedRampFromSpeed === fromSpeed;
    const sameDuration = Math.abs((item.duration || 0) - duration) < 1e-9;
    if (sameFrom && sameDuration) return item;
    changed = true;
    return { ...candidate, duration };
  });
  return changed ? next : items;
}

/**
 * ソース尺と速度からタイムライン尺を求める。
 * なめらか接続があるときは、段の区間 + 残りを設定速度で割った尺。
 */
export function computeTimelineDurationFromSource(
  sourceDuration: number,
  speed: unknown,
  speedRamp?: VideoSpeedRamp | null,
): number {
  const s = normalizeVideoPlaybackSpeed(speed);
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) return 0;
  if (!speedRamp) return sourceDuration / s;
  return speedRamp.timelineDuration + Math.max(0, sourceDuration - speedRamp.sourceDuration) / s;
}

/**
 * 動画 MediaItem のタイムライン尺を trim と speed（なめらか接続を含む）から再計算する。
 */
export function resolveVideoTimelineDuration(item: {
  type?: string;
  trimStart?: number;
  trimEnd?: number;
  originalDuration?: number;
  playbackSpeed?: unknown;
  duration?: number;
  speedRampIn?: boolean;
  speedRampFromSpeed?: number;
  speedRampDuration?: number;
}): number {
  if (item.type === 'image') {
    return Number.isFinite(item.duration) ? Math.max(0, item.duration as number) : 0;
  }
  const source = getVideoSourceClipDuration(item);
  return computeTimelineDurationFromSource(
    source,
    item.playbackSpeed,
    resolveVideoSpeedRampForItem(item),
  );
}

/**
 * タイムライン上の localTime → 元動画 currentTime。
 * `speedRamp` を渡すと、クリップ先頭のなめらか接続の段も反映する。
 */
export function resolveVideoSourceTime(params: {
  trimStart?: number;
  localTime: number;
  playbackSpeed?: unknown;
  speedRamp?: VideoSpeedRamp | null;
}): number {
  const trimStart = Number.isFinite(params.trimStart)
    ? Math.max(0, params.trimStart as number)
    : 0;
  return trimStart + resolveVideoSourceOffsetAtLocalTime(
    params.localTime,
    params.playbackSpeed,
    params.speedRamp,
  );
}

/** アイテムから直接ソース時刻を求める（なめらか接続を含む） */
export function resolveItemVideoSourceTime(
  item: VideoSpeedRampItemFields,
  localTime: number,
): number {
  return resolveVideoSourceTime({
    trimStart: item.trimStart,
    localTime,
    playbackSpeed: item.playbackSpeed,
    speedRamp: resolveVideoSpeedRampForItem(item),
  });
}

/**
 * クリップ終端直前のソース時刻（ended や境界ガード用）。
 */
export function resolveVideoSafeEndSourceTime(params: {
  trimStart?: number;
  trimEnd?: number;
  timelineDuration?: number;
  playbackSpeed?: unknown;
  epsilon?: number;
}): number {
  const epsilon = Number.isFinite(params.epsilon) ? Math.max(0, params.epsilon as number) : 0.001;
  const trimStart = Number.isFinite(params.trimStart)
    ? Math.max(0, params.trimStart as number)
    : 0;
  if (Number.isFinite(params.trimEnd) && (params.trimEnd as number) > trimStart) {
    return Math.max(trimStart, (params.trimEnd as number) - epsilon);
  }
  const timelineDuration = Number.isFinite(params.timelineDuration)
    ? Math.max(0, params.timelineDuration as number)
    : 0;
  const speed = normalizeVideoPlaybackSpeed(params.playbackSpeed);
  return trimStart + Math.max(0, timelineDuration * speed - epsilon);
}

export function normalizeSpeedBadgePosition(
  x?: number,
  y?: number,
): { x: number; y: number } {
  return {
    x: clamp(
      Number.isFinite(x) ? (x as number) : DEFAULT_SPEED_BADGE_POSITION.x,
      0,
      100,
    ),
    y: clamp(
      Number.isFinite(y) ? (y as number) : DEFAULT_SPEED_BADGE_POSITION.y,
      0,
      100,
    ),
  };
}

export function resolveSpeedBadgePresetPosition(
  preset: SpeedBadgePositionPreset,
): { x: number; y: number } {
  const inset = SPEED_BADGE_CORNER_INSET_PERCENT;
  const left = inset;
  const right = 100 - inset;
  const top = inset;
  const bottom = 100 - inset;
  switch (preset) {
    case 'top-left':
      return { x: left, y: top };
    case 'bottom-left':
      return { x: left, y: bottom };
    case 'bottom-right':
      return { x: right, y: bottom };
    case 'top-right':
    default:
      return { x: right, y: top };
  }
}

export function normalizeSpeedBadgeLabelStyle(value: unknown): SpeedBadgeLabelStyle {
  return value === 'en' ? 'en' : DEFAULT_SPEED_BADGE_LABEL_STYLE;
}

/**
 * バッジ表示文言。既定は日本語（例: » 2倍速）。英語は » 2x。
 */
export function formatSpeedBadgeLabel(
  speed: unknown,
  labelStyle?: unknown,
): string {
  const shown = formatPlaybackSpeedValue(speed);
  const style = normalizeSpeedBadgeLabelStyle(labelStyle);
  if (style === 'en') {
    return `\u00BB ${shown}x`;
  }
  return `\u00BB ${shown}倍速`;
}

/**
 * エクスポート時の動画同期しきい値（ソース時刻秒）。
 * 等倍: 基本しきい値。
 * 倍速: プレビューは rate 連続、export は 1x 連続 + 壁時計 dilation のため、
 * いずれも過剰な correction seek を避ける緩めしきい値。
 */
export function resolveSpeedAwareVideoSyncThresholdSec(
  baseThresholdSec: number,
  playbackSpeed: unknown,
): number {
  const base = Number.isFinite(baseThresholdSec) && baseThresholdSec > 0
    ? baseThresholdSec
    : 0.5;
  const speed = normalizeVideoPlaybackRateValue(playbackSpeed);
  if (speed <= 1) return base;
  // プレビュー連続再生用: 2x なら 0.5→1.0 程度まで緩める
  return Math.max(base, base * speed * 0.75);
}

/**
 * export 壁時計 1 秒あたり、タイムラインを 1/divisor 秒進める。
 * 倍速（speed>1）では divisor=speed（映像は 1x 連続再生し、タイムラインだけ縮める）。
 * スロー（speed<1）・画像・等倍は 1（スローは playbackRate=speed で壁時計=タイムライン）。
 *
 * 採用しない方式:
 * - 倍速で playbackRate=speed の連続再生: デコード遅れでソース終端まで届かず途中切れ
 * - paused + 毎フレーム seek: 連続 seek で静止画化（export-video-backpressure-postmortem）
 * - スローで壁時計 dilation: タイムラインが壁より速く進み、出力フレームが不足する
 */
export function resolveExportTimelineWallDivisorForItem(
  item: VideoSpeedRampItemFields | null | undefined,
  localTime?: number,
): number {
  if (!item || item.type === 'image') return 1;
  // なめらか接続の区間では段の速さで割る（段ごとに倍速 dilation / native slow を切り替える）
  const speed = Number.isFinite(localTime)
    ? resolveItemPlaybackSpeedAtLocalTime(item, localTime as number)
    : normalizeVideoPlaybackSpeed(item.playbackSpeed);
  return speed > 1 ? speed : 1;
}

/**
 * 壁時計差分を export タイムライン進行に変換する。
 * timelineDelta = wallDelta / divisor
 */
export function wallDeltaToExportTimelineDelta(
  wallDeltaSec: number,
  wallDivisor: number,
): number {
  const divisor = Number.isFinite(wallDivisor) && wallDivisor > 0 ? wallDivisor : 1;
  const wall = Number.isFinite(wallDeltaSec) ? Math.max(0, wallDeltaSec) : 0;
  return wall / divisor;
}

/**
 * `<video>.playbackRate` に渡す値。
 * - preview: 設定速度
 * - export の倍速（>1）: 常に 1（壁時計 dilation と対）
 * - export のスロー（<1）: 設定速度（デコーダに余裕があるので native slow が安全）
 */
export function resolveVideoElementPlaybackRateForContext(
  isExporting: boolean,
  playbackSpeed: unknown,
): VideoPlaybackSpeed {
  // なめらか接続の途中段（例: 0.967）も丸めずに通す
  const speed = normalizeVideoPlaybackRateValue(playbackSpeed);
  if (isExporting && speed > 1) return DEFAULT_VIDEO_PLAYBACK_SPEED;
  return speed;
}

/**
 * 追従補正を始めるずれ（タイムライン秒）。これ未満は補正しない。
 * rate を変えると preservesPitch の時間伸縮で音が切り貼りされ、切り替えのたびに
 * プチプチ音が出るため、クリップ境界の play() 開始遅れ程度（〜0.1 秒）では動かさない（13-286）。
 */
export const VIDEO_CATCH_UP_START_SEC = 0.12;
/** 補正中に、ここまで寄ったら設定速度へ戻す（ヒステリシス。開始と同じ値だと境目で往復する） */
export const VIDEO_CATCH_UP_STOP_SEC = 0.03;
/** これ以上のずれは既存の seek / recovery に任せる（タイムライン秒） */
export const VIDEO_CATCH_UP_MAX_DRIFT_SEC = 1.0;
/**
 * 補正中の速度比（設定速度に対して ±6%・固定）。
 * ずれに比例させて刻みで変えると補正 1 回で rate が何度も切り替わり、音が乱れる。
 * 固定にして、1 回の補正で rate が変わるのは「開始」と「終了」の 2 回だけにする。
 */
export const VIDEO_CATCH_UP_RATIO = 0.06;
/** プレビューで追従補正する設定速度の上限（高倍速は decode 余裕が無いので補正しない） */
export const VIDEO_CATCH_UP_PREVIEW_MAX_SPEED = 2;

export interface VideoCatchUpParams {
  isExporting: boolean;
  playbackSpeed: unknown;
  videoCurrentTime: number;
  targetSourceTime: number;
  canCatchUp: boolean;
  /** 直前のフレームで補正中だったか（ヒステリシス用。未指定は補正していない扱い） */
  wasCatchingUp?: boolean;
}

/**
 * 動画の `<video>.playbackRate` を、タイムライン時計とのずれに応じて一時的に増減する。
 *
 * キャプション・ナレーション・BGM はタイムライン時計に従う。一方 `<video>` は play() 開始遅れや
 * export backpressure 後の再開遅れでタイムラインから遅れたまま進み、seek しきい値（ソース秒 0.5）
 * 未満のずれは補正されない。スロー 0.5x ではタイムライン上 1 秒近いずれが残り、
 * 「再生中・シーク後・書き出し」で字幕と映像の位置関係が変わる原因になっていた。
 * seek は Android でカクつくため、ずれは速度の調整で吸収する。
 *
 * - 0.12 秒以上ずれたら固定 ±6% で寄せ、0.03 秒以内に戻ったら設定速度へ戻す（ヒステリシス）。
 * - export は補正しない（倍速 rate=1 + 壁時計 dilation、等倍・スローの native rate を変えない。
 *   export はクリップ先頭で映像が動き出すまでタイムラインを止める境界待機で揃えている）。
 * - プレビューは 2x まで補正する（高倍速は decode 余裕が無いので rate を上げない）。
 */
export function resolveVideoCatchUpState(params: VideoCatchUpParams): {
  rate: number;
  isCatchingUp: boolean;
} {
  const baseRate = resolveVideoElementPlaybackRateForContext(params.isExporting, params.playbackSpeed);
  const idle = { rate: baseRate, isCatchingUp: false };
  if (params.isExporting || !params.canCatchUp) return idle;
  const speed = normalizeVideoPlaybackRateValue(params.playbackSpeed);
  if (speed > VIDEO_CATCH_UP_PREVIEW_MAX_SPEED) return idle;
  if (!Number.isFinite(params.videoCurrentTime) || !Number.isFinite(params.targetSourceTime)) {
    return idle;
  }

  // 正: 映像がタイムラインより遅れている（速める）/ 負: 進んでいる（遅くする）
  const timelineLagSec = (params.targetSourceTime - params.videoCurrentTime) / speed;
  const absLagSec = Math.abs(timelineLagSec);
  if (absLagSec > VIDEO_CATCH_UP_MAX_DRIFT_SEC) return idle;
  const threshold = params.wasCatchingUp ? VIDEO_CATCH_UP_STOP_SEC : VIDEO_CATCH_UP_START_SEC;
  if (absLagSec < threshold) return idle;

  const ratio = timelineLagSec > 0 ? VIDEO_CATCH_UP_RATIO : -VIDEO_CATCH_UP_RATIO;
  return { rate: Number((baseRate * (1 + ratio)).toFixed(4)), isCatchingUp: true };
}

/** `resolveVideoCatchUpState` の rate だけを返す版（補正中の状態を持たない呼び出し向け） */
export function resolveVideoCatchUpPlaybackRate(params: VideoCatchUpParams): number {
  return resolveVideoCatchUpState(params).rate;
}

/**
 * 書き出し中の 2 画面表示で、相手（peer）を active へ寄せ始めるずれ（タイムライン秒）。
 * 書き出し 30fps の約 1 コマ。境界待機の解除後は active が先に動き、peer の play() は次のフレームになるため、
 * 0.03〜0.05 秒のずれが残りやすい（0.05 秒からにすると 1〜2 コマ遅れたまま区間の終わりまで残った）。
 */
export const EXPORT_SPLIT_COMPARE_PEER_SYNC_START_SEC = 0.03;
/** 補正中に、ここまで寄ったら通常の速さへ戻す（ヒステリシス。開始と同じ値だと境目で往復する） */
export const EXPORT_SPLIT_COMPARE_PEER_SYNC_STOP_SEC = 0.01;
/**
 * 補正中の速度比（±15%・固定）。書き出しの音声は事前レンダリング済みで video 要素の音は出力に入らないため、
 * プレビュー（±6%・13-286）より強く寄せ、数秒の 2 画面区間の中で揃え切る（0.1 秒のずれを約 0.7 秒で吸収）。
 */
export const EXPORT_SPLIT_COMPARE_PEER_SYNC_RATIO = 0.15;

export interface ExportSplitComparePeerSyncParams {
  /** peer の `<video>.currentTime`（ソース秒） */
  peerCurrentTime: number;
  /** peer がいま表示しているべきソース秒 */
  peerTargetTime: number;
  /** peer の設定速度（ソース秒 / タイムライン秒）。ずれをタイムライン秒へ直すのに使う */
  peerSpeed: number;
  /** 直前のフレームで補正中だったか（ヒステリシス用） */
  wasCorrecting?: boolean;
}

/**
 * 書き出し中の 2 画面表示の相手（peer）に掛ける速度の倍率を返す（13-336）。
 *
 * 書き出しでは peer を native 再生のまま流し、1 秒を超えるずれだけ単発 seek していた。
 * そのため開始時の play() の立ち上がり差などで生じた 1 秒未満のずれが、2 画面の区間の終わりまで残った。
 * seek は書き出しで静止画化・カクつきの原因になるため（13-153 / 13-189）、速度だけで寄せる。
 *
 * - 0.03 秒以上ずれたら固定 ±15% で寄せ、0.01 秒以内に戻ったら 1 倍へ戻す（ヒステリシス）。
 * - 1 秒を超えるずれは従来の単発 seek に任せる（ここでは 1 倍を返す）。
 */
export function resolveExportSplitComparePeerSyncState(params: ExportSplitComparePeerSyncParams): {
  rateFactor: number;
  isCorrecting: boolean;
} {
  const idle = { rateFactor: 1, isCorrecting: false };
  if (!Number.isFinite(params.peerCurrentTime) || !Number.isFinite(params.peerTargetTime)) {
    return idle;
  }
  const speed = Number.isFinite(params.peerSpeed) && params.peerSpeed > 0 ? params.peerSpeed : 1;
  // 正: peer が遅れている（速める）/ 負: 進んでいる（遅くする）
  const lagSec = (params.peerTargetTime - params.peerCurrentTime) / speed;
  const absLagSec = Math.abs(lagSec);
  if (absLagSec > VIDEO_CATCH_UP_MAX_DRIFT_SEC) return idle;
  const threshold = params.wasCorrecting
    ? EXPORT_SPLIT_COMPARE_PEER_SYNC_STOP_SEC
    : EXPORT_SPLIT_COMPARE_PEER_SYNC_START_SEC;
  if (absLagSec < threshold) return idle;
  const ratio = lagSec > 0 ? EXPORT_SPLIT_COMPARE_PEER_SYNC_RATIO : -EXPORT_SPLIT_COMPARE_PEER_SYNC_RATIO;
  return { rateFactor: 1 + ratio, isCorrecting: true };
}

/**
 * 2 画面表示の相手（peer）がいま表示しているべきソース秒を、active の実際の再生位置から求める（13-336）。
 *
 * 書き出しでは active も peer も壁時計とは独立に native 再生しているため、左右の見た目を揃えるには
 * タイムライン時計ではなく active の再生位置に合わせる。active のソース位置 → タイムライン時刻 →
 * peer のソース位置の順に写す（なめらか接続の段も反映）。peer は自分の尺の手前で止める。
 */
export function resolveSplitComparePeerTargetFromActive(params: {
  active: VideoSpeedRampItemFields;
  activeCurrentTime: number;
  activeRangeStart: number;
  peer: VideoSpeedRampItemFields;
  peerRangeStart: number;
  peerDuration: number;
}): number | null {
  if (
    !Number.isFinite(params.activeCurrentTime)
    || !Number.isFinite(params.activeRangeStart)
    || !Number.isFinite(params.peerRangeStart)
    || !Number.isFinite(params.peerDuration)
  ) {
    return null;
  }
  const activeTrimStart = Number.isFinite(params.active.trimStart)
    ? Math.max(0, params.active.trimStart as number)
    : 0;
  const activeLocalTime = resolveVideoLocalTimeAtSourceOffset(
    params.activeCurrentTime - activeTrimStart,
    params.active.playbackSpeed,
    resolveVideoSpeedRampForItem(params.active),
  );
  const peerLocalTime = clamp(
    params.activeRangeStart + activeLocalTime - params.peerRangeStart,
    0,
    Math.max(0, params.peerDuration - 0.001),
  );
  return resolveItemVideoSourceTime(params.peer, peerLocalTime);
}

export function shouldDrawSpeedBadge(
  item: Pick<MediaItem, 'type' | 'playbackSpeed' | 'showSpeedBadge'> | null | undefined,
): boolean {
  if (!item || item.type !== 'video') return false;
  if (!item.showSpeedBadge) return false;
  return Math.abs(normalizeVideoPlaybackSpeed(item.playbackSpeed) - 1) >= VIDEO_PLAYBACK_SPEED_STEP / 2;
}

/**
 * 倍速バッジを対象動画の映像フェードと同じタイミングで表示するためのアルファ値。
 * フェードインとアウトの合計がクリップ尺を超える場合も、映像描画と同じ比率で按分する。
 */
export function resolveSpeedBadgeFadeAlpha(
  item: Pick<
    MediaItem,
    'duration' | 'fadeIn' | 'fadeOut' | 'fadeInDuration' | 'fadeOutDuration'
  >,
  localTime: number,
): number {
  if (!Number.isFinite(localTime) || !Number.isFinite(item.duration) || item.duration <= 0) {
    return 0;
  }

  let fadeInDuration = item.fadeIn ? (item.fadeInDuration || 1) : 0;
  let fadeOutDuration = item.fadeOut ? (item.fadeOutDuration || 1) : 0;
  if (fadeInDuration + fadeOutDuration > item.duration) {
    const ratio = item.duration / (fadeInDuration + fadeOutDuration);
    fadeInDuration *= ratio;
    fadeOutDuration *= ratio;
  }

  let alpha = 1;
  if (fadeInDuration > 0 && localTime < fadeInDuration) {
    alpha = localTime / fadeInDuration;
  } else if (fadeOutDuration > 0 && localTime > item.duration - fadeOutDuration) {
    alpha = (item.duration - localTime) / fadeOutDuration;
  }
  return Math.max(0, Math.min(1, alpha));
}

/**
 * アクティブ動画クリップの倍速バッジを Canvas に描画する。
 * @returns 描画したら true
 */
export function drawSpeedBadgeFrame(
  ctx: CanvasRenderingContext2D,
  item: Pick<
    MediaItem,
    | 'type'
    | 'playbackSpeed'
    | 'showSpeedBadge'
    | 'speedBadgeLabelStyle'
    | 'speedBadgePositionX'
    | 'speedBadgePositionY'
    | 'duration'
    | 'fadeIn'
    | 'fadeOut'
    | 'fadeInDuration'
    | 'fadeOutDuration'
  > | null | undefined,
  localTime: number,
): boolean {
  if (!shouldDrawSpeedBadge(item) || !item) return false;
  const fadeAlpha = resolveSpeedBadgeFadeAlpha(item, localTime);
  if (fadeAlpha <= 0) return false;
  const speed = normalizeVideoPlaybackSpeed(item.playbackSpeed);
  const pos = normalizeSpeedBadgePosition(item.speedBadgePositionX, item.speedBadgePositionY);
  const canvasW = ctx.canvas.width;
  const canvasH = ctx.canvas.height;
  if (canvasW <= 0 || canvasH <= 0) return false;

  const shortSide = Math.min(canvasW, canvasH);
  const fontSize = Math.max(14, Math.round(shortSide * 0.045));
  const padX = Math.max(8, Math.round(fontSize * 0.55));
  const padY = Math.max(5, Math.round(fontSize * 0.35));
  const label = formatSpeedBadgeLabel(speed, item.speedBadgeLabelStyle);

  ctx.save();
  ctx.globalAlpha *= fadeAlpha;
  ctx.font = `600 ${fontSize}px system-ui, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const metrics = ctx.measureText(label);
  const textW = metrics.width;
  const boxW = textW + padX * 2;
  const boxH = fontSize + padY * 2;
  const cx = (canvasW * pos.x) / 100;
  const cy = (canvasH * pos.y) / 100;
  const left = cx - boxW / 2;
  const top = cy - boxH / 2;
  const radius = Math.min(boxH / 2, Math.max(6, fontSize * 0.35));

  // 背景ピル
  ctx.beginPath();
  const r = radius;
  const x = left;
  const y = top;
  const w = boxW;
  const h = boxH;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = Math.max(1, shortSide * 0.002);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fillText(label, cx, cy + fontSize * 0.04);
  ctx.restore();
  return true;
}

/**
 * HTMLVideoElement の playbackRate を設定する。
 * - プレビュー: 設定速度で連続再生。preservesPitch で音程維持。
 * - エクスポートの倍速: 必ず 1（`resolveVideoElementPlaybackRateForContext` 経由）。
 *   倍速は壁時計 dilation でタイムラインを縮める。rate=speed は途中切れ、
 *   seek 駆動は静止画化するため使わない。
 * - エクスポートのスロー: 設定速度（native slow）。dilation するとフレーム不足になる。
 * 失敗しても再生継続できるよう例外は握りつぶす。
 */
export function applyVideoElementPlaybackRate(
  video: HTMLVideoElement | null | undefined,
  speed: unknown,
): void {
  setVideoElementPlaybackRate(video, normalizeVideoPlaybackRateValue(speed));
}

/**
 * `resolveVideoCatchUpPlaybackRate` の結果を 0.1 刻みへ丸めずに設定する。
 */
export function applyVideoElementCatchUpPlaybackRate(
  video: HTMLVideoElement | null | undefined,
  rate: number,
): void {
  if (!Number.isFinite(rate) || rate <= 0) return;
  setVideoElementPlaybackRate(video, clamp(rate, 0.25, 16));
}

function setVideoElementPlaybackRate(
  video: HTMLVideoElement | null | undefined,
  rate: number,
): void {
  if (!video) return;
  try {
    // プレビューは音程を保ったままテンポだけ変える（Chrome 既定も true だが明示）。
    const media = video as HTMLMediaElement & {
      preservesPitch?: boolean;
      mozPreservesPitch?: boolean;
      webkitPreservesPitch?: boolean;
    };
    try {
      media.preservesPitch = true;
      if ('mozPreservesPitch' in media) media.mozPreservesPitch = true;
      if ('webkitPreservesPitch' in media) media.webkitPreservesPitch = true;
    } catch { /* ignore */ }
    if (Math.abs(video.playbackRate - rate) > 0.001) {
      video.playbackRate = rate;
    }
  } catch {
    // 一部環境で rate 設定が拒否されても致命ではない
  }
}
