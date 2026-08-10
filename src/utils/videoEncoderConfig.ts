/**
 * @file videoEncoderConfig.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description VideoEncoder の設定候補を組み立てる純ロジック。
 *
 * 目的は「エクスポートを軽くする」こと。既存の成功している駆動方式
 * （壁時計 dilation / native 連続再生 / backpressure）には一切触れない。
 * ここで扱うのは encoder の configure 内容だけで、フレーム供給の
 * タイミングやリカバリ経路は変更しない。
 *
 * 効きどころ:
 * - `hardwareAcceleration: 'prefer-hardware'` … GPU/専用エンコーダを優先し CPU 負荷を下げる
 * - `latencyMode: 'realtime'` … 目標 fps を出力期限として扱い、長い内部滞留を避ける
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
 * WebCodecs 仕様では `latencyMode` の既定値は `quality` である。
 * したがって「未指定 = realtime 相当」ではなく、未指定候補も品質優先として扱う必要がある。
 * `quality` はエンコーダに出力を溜め込む自由を与えるため、
 * `encodeQueueSize` が実際の消化状況を正しく表さなくなる恐れがある。
 * それは backpressure の検知遅れ = 「映像内容だけが遅れて後半が黒」という
 * 過去に実機で発生した最悪の症状の再発条件そのものになる。
 *
 * リカバリ性はユーザーが最も評価している点であり、速度と引き換えにしない。
 * 明示的な `realtime` 候補を最優先し、未対応環境だけ従来の未指定候補へ段階的に戻す。
 * 駆動方式・queue 上限・bitrate は変えず、`encodeQueueSize` による既存の安全弁も維持する。
 */

/** エンコーダ設定の選定結果（診断ログ用に理由を持つ） */
export interface ResolvedVideoEncoderConfig {
  config: VideoEncoderConfig;
  /** 実際に採用した候補の名前（ログ用） */
  variant:
    | 'prefer-hardware-realtime'
    | 'no-preference-realtime'
    | 'prefer-hardware'
    | 'no-preference'
    | 'baseline';
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
  params: BuildVideoEncoderConfigParams
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
 * 先頭ほど低遅延・軽負荷だが対応環境を選ぶ。`realtime` 非対応時も既存の
 * hardware/no-preference 候補を残し、最後は必ず現行と同じ baseline にする。
 */
export function buildVideoEncoderConfigCandidates(
  params: BuildVideoEncoderConfigParams
): Array<{ variant: ResolvedVideoEncoderConfig['variant']; config: VideoEncoderConfig }> {
  const baseline = buildBaselineVideoEncoderConfig(params);

  return [
    {
      // GPU / 専用エンコーダ + realtime を最優先する。WebCodecs 仕様の既定は
      // quality なので、低遅延を意図する場合は明示が必要。
      variant: 'prefer-hardware-realtime',
      config: {
        ...baseline,
        hardwareAcceleration: 'prefer-hardware',
        latencyMode: 'realtime',
        avc: { format: 'avc' },
      },
    },
    {
      // HW 指定との組み合わせだけが非対応でも、realtime 自体を利用できる環境向け。
      variant: 'no-preference-realtime',
      config: {
        ...baseline,
        hardwareAcceleration: 'no-preference',
        latencyMode: 'realtime',
        avc: { format: 'avc' },
      },
    },
    {
      // realtime 非対応時は、従来どおり hardware 優先 + AVCC を試す。
      variant: 'prefer-hardware',
      config: {
        ...baseline,
        hardwareAcceleration: 'prefer-hardware',
        avc: { format: 'avc' },
      },
    },
    {
      // HW も realtime も明示できない環境向け。従来の第2候補。
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
  params: BuildVideoEncoderConfigParams
): Promise<ResolvedVideoEncoderConfig> {
  const candidates = buildVideoEncoderConfigCandidates(params);
  const baseline = candidates[candidates.length - 1];

  const canProbe =
    typeof VideoEncoder !== 'undefined' && typeof VideoEncoder.isConfigSupported === 'function';

  if (!canProbe) {
    return { config: baseline.config, variant: 'baseline', negotiated: false };
  }

  for (const candidate of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported(candidate.config);
      if (support?.supported) {
        // ブラウザが正規化した config を返す場合はそちらを優先する。ただし
        // 省略された明示値（特に realtime）を失わないよう候補へマージする。
        const normalizedConfig = {
          ...candidate.config,
          ...(support.config ?? {}),
        };
        // realtime を明示したのに quality へ正規化された環境では、この候補を
        // realtime 成功として扱わない。従来候補へ進みログと実挙動の食い違いを防ぐ。
        if (
          candidate.config.latencyMode === 'realtime' &&
          normalizedConfig.latencyMode !== 'realtime'
        ) {
          continue;
        }
        return {
          config: normalizedConfig,
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
