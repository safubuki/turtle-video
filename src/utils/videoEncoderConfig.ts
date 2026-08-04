/**
 * @file videoEncoderConfig.ts
 * @author Turtle Village
 * @description VideoEncoder の設定候補を組み立てる純ロジック。
 *
 * 目的は「エクスポートを軽くする」こと。既存の成功している駆動方式
 * （壁時計 dilation / native 連続再生 / backpressure）には一切触れない。
 * ここで扱うのは encoder の configure 内容だけで、フレーム供給の
 * タイミングやリカバリ経路は変更しない。
 *
 * 効きどころ:
 * - `hardwareAcceleration: 'prefer-hardware'` … GPU/専用エンコーダを優先し CPU 負荷を下げる
 * - `avc: { format: 'avc' }` … mp4-muxer が期待する AVCC 形式を明示する
 *
 * いずれも「対応していれば使う」方式で、`VideoEncoder.isConfigSupported()` の
 * 結果に応じて安全側へ落とす。未対応環境では現行と同一の設定になる。
 *
 * ## `latencyMode: 'quality'` を使わない理由（重要・戻さないこと）
 *
 * 一見「エンコーダ内部のバッファリングを許せば負荷を吸収できる」ように見えるが、
 * このプロジェクトの export は **`encodeQueueSize` を唯一の真実として** 動いている:
 *
 * - backpressure（13-153 / postmortem 2026-07-27）は `encodeQueueSize` が HARD 上限に
 *   達したことを検知して、壁時計タイムラインと `<video>` を **同時に** 止める。
 *   これが「3つの時計を同じ区間だけ止める」という成功の核心だった。
 * - 13-116 は「`output` callback 完了待ちは **H.264 の内部バッファリングで停止し得る**ため使わない」
 *   と明示している。内部バッファリングは既にこのプロジェクトで危険と判断された挙動。
 *
 * `latencyMode: 'quality'` はエンコーダに出力を溜め込む自由を与えるため、
 * `encodeQueueSize` が実際の消化状況を正しく表さなくなる恐れがある。
 * それは backpressure の検知遅れ = 「映像内容だけが遅れて後半が黒」という
 * 過去に実機で発生した最悪の症状の再発条件そのものになる。
 *
 * リカバリ性はユーザーが最も評価している点であり、速度と引き換えにしない。
 * 既定（realtime 相当）のままにして、`encodeQueueSize` の信頼性を守る。
 */

/** エンコーダ設定の選定結果（診断ログ用に理由を持つ） */
export interface ResolvedVideoEncoderConfig {
  config: VideoEncoderConfig;
  /** 実際に採用した候補の名前（ログ用） */
  variant: 'prefer-hardware' | 'no-preference' | 'baseline';
  /** isConfigSupported で候補を絞れたか。false ならフォールバック採用 */
  negotiated: boolean;
}

export interface BuildVideoEncoderConfigParams {
  width: number;
  height: number;
  bitrate: number;
  framerate: number;
  /** 既定 'avc1.4d002a'（Main Profile Level 4.2）。呼び出し側の現行値を尊重する */
  codec?: string;
}

/** 現行実装と完全に同じ最小構成。フォールバック先であり、挙動の基準線。 */
export function buildBaselineVideoEncoderConfig(
  params: BuildVideoEncoderConfigParams,
): VideoEncoderConfig {
  return {
    codec: params.codec ?? 'avc1.4d002a',
    width: params.width,
    height: params.height,
    bitrate: params.bitrate,
    framerate: params.framerate,
  };
}

/**
 * 試行順に並べた設定候補を返す。
 *
 * 先頭ほど「軽い」が対応環境を選ぶ。最後は必ず現行と同じ baseline で、
 * どの環境でも従来どおり動くことを保証する。
 */
export function buildVideoEncoderConfigCandidates(
  params: BuildVideoEncoderConfigParams,
): Array<{ variant: ResolvedVideoEncoderConfig['variant']; config: VideoEncoderConfig }> {
  const baseline = buildBaselineVideoEncoderConfig(params);

  return [
    {
      // GPU / 専用エンコーダを優先。CPU 負荷とメモリ帯域が最も下がる想定。
      // latencyMode は指定しない（既定=realtime 相当を維持し encodeQueueSize の
      // 信頼性を守る。理由はファイル冒頭のコメント参照）。
      variant: 'prefer-hardware',
      config: {
        ...baseline,
        hardwareAcceleration: 'prefer-hardware',
        avc: { format: 'avc' },
      },
    },
    {
      // HW を明示指定できない環境向け。avc format の明示だけ試す。
      variant: 'no-preference',
      config: {
        ...baseline,
        hardwareAcceleration: 'no-preference',
        avc: { format: 'avc' },
      },
    },
    {
      // 現行と同一。ここまで落ちれば挙動は従来どおり。
      variant: 'baseline',
      config: baseline,
    },
  ];
}

/**
 * `VideoEncoder.isConfigSupported()` で候補を順に検証し、最初に通ったものを採用する。
 *
 * - `isConfigSupported` が無い / 例外を投げる環境では baseline をそのまま返す
 *   （negotiated: false）。ここで失敗しても書き出し自体は現行どおり動く。
 * - 何も通らなかった場合も baseline を返す。configure の可否は呼び出し側の
 *   try/catch が最終的な砦になる。
 */
export async function resolveVideoEncoderConfig(
  params: BuildVideoEncoderConfigParams,
): Promise<ResolvedVideoEncoderConfig> {
  const candidates = buildVideoEncoderConfigCandidates(params);
  const baseline = candidates[candidates.length - 1];

  const canProbe =
    typeof VideoEncoder !== 'undefined'
    && typeof VideoEncoder.isConfigSupported === 'function';

  if (!canProbe) {
    return { config: baseline.config, variant: 'baseline', negotiated: false };
  }

  for (const candidate of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported(candidate.config);
      if (support?.supported) {
        // ブラウザが正規化した config を返す場合はそちらを優先する
        return {
          config: support.config ?? candidate.config,
          variant: candidate.variant,
          negotiated: true,
        };
      }
    } catch {
      // この候補は検証不能。次の候補へ進む。
    }
  }

  return { config: baseline.config, variant: 'baseline', negotiated: false };
}
