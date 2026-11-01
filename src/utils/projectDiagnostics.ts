/**
 * @file projectDiagnostics.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 不具合解析用に、画面に表示されている設定値のうちタイミング・同期の調査に必要なものだけを JSON にまとめる。
 *
 * 方針（ユーザーが共有する前提）:
 * - 画面に見えている設定値だけを出す。項目名は画面の表示に沿った一般的な名前にし、内部のプロパティ名や
 *   データ構造をそのまま出さない。
 * - 内部の計算途中の値（重なり秒数の算出結果・有効区間の判定フラグ・音量揃えのゲイン）、内部 ID、URL、
 *   フレーバー名は出さない。
 * - キャプション本文・ナレーション原稿・AI 音声設定・API キー・見た目の調整値（位置・拡大率・回転・
 *   ぼかし・ズーム）も出さない。
 */
import type { Caption, MediaItem, NarrationClip } from '../types';
import {
  isBgmClipId,
  resolveBgmClipsEffectivePlayback,
  resolvePipelineClipEffectivePlayback,
} from '../stores/audioStore';
import { normalizeVideoPlaybackSpeed } from './playbackSpeed';
import {
  calculateTotalDurationWithTransitions,
  computeTransitionTimelineRanges,
} from './transitionTimeline';

export const PROJECT_DIAGNOSTICS_FORMAT = 'turtle-video-settings-report';
export const PROJECT_DIAGNOSTICS_FORMAT_VERSION = 1;

export interface ProjectDiagnosticsInput {
  mediaItems: MediaItem[];
  bgmClips: NarrationClip[];
  narrations: NarrationClip[];
  captions: Array<Pick<Caption, 'startTime' | 'endTime'>>;
  bgmFitToVideoEnd: boolean;
  endrollSeconds: number;
  output: { width: number; height: number; orientation: string; fps: number };
  appVersion: string;
  generatedAt?: Date;
}

/** 秒・倍率は画面と同じく小数第 2 位までに丸める */
function round2(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : null;
}

function percent(volume: unknown): number | null {
  return typeof volume === 'number' && Number.isFinite(volume) ? Math.round(volume * 100) : null;
}

function fileNameOf(file: unknown): string | null {
  if (file && typeof file === 'object' && 'name' in file) {
    const name = (file as { name?: unknown }).name;
    return typeof name === 'string' ? name : null;
  }
  return null;
}

/** フェードは画面と同じく「OFF なら null、ON なら秒数」 */
function fadeSeconds(enabled: boolean | undefined, duration: number | undefined): number | null {
  return enabled ? round2(duration || 1) : null;
}

const TRANSITION_LABELS: Record<string, string> = {
  dissolve: 'dissolve',
  'fade-black': 'fade-black',
  'fade-white': 'fade-white',
};

/**
 * 解析用の設定レポートを作る。
 */
export function buildProjectDiagnostics(input: ProjectDiagnosticsInput) {
  const ranges = computeTransitionTimelineRanges(input.mediaItems);
  const clipsSeconds = calculateTotalDurationWithTransitions(input.mediaItems);
  const endrollSeconds = Math.max(0, input.endrollSeconds || 0);
  const totalSeconds = clipsSeconds + endrollSeconds;

  const clips = input.mediaItems.map((item, index) => {
    const hasNext = index + 1 < input.mediaItems.length;
    const transition = item.transitionToNext && hasNext
      ? {
        type: TRANSITION_LABELS[item.transitionToNext.type] ?? 'other',
        seconds: round2(item.transitionToNext.duration),
      }
      : null;
    return {
      no: index + 1,
      kind: item.type === 'video' ? 'video' : 'image',
      fileName: fileNameOf(item.file),
      // タイムライン上の表示区間（ディゾルブの重なりを含む）
      start: round2(ranges[index]?.start),
      end: round2(ranges[index]?.end),
      ...(item.type === 'video'
        ? {
          sourceLength: round2(item.originalDuration),
          trimIn: round2(item.trimStart),
          trimOut: round2(item.trimEnd),
          speed: normalizeVideoPlaybackSpeed(item.playbackSpeed),
          mute: !!item.isMuted,
          volumePercent: percent(item.volume),
        }
        : {}),
      fadeIn: fadeSeconds(item.fadeIn, item.fadeInDuration),
      fadeOut: fadeSeconds(item.fadeOut, item.fadeOutDuration),
      // 次のクリップへのつなぎ方
      transition,
    };
  });

  // 実際に鳴る区間は、プレビュー／書き出しと同じ規約で求める（画面の「長さ」表示と同じ値）。
  const pipelineClips = [...input.narrations, ...input.bgmClips];
  const bgmPlayRanges = resolveBgmClipsEffectivePlayback(
    pipelineClips.filter((clip) => isBgmClipId(clip.id)),
    totalSeconds,
    { autoAdjust: input.bgmFitToVideoEnd },
  );
  const describeAudio = (clip: NarrationClip, index: number, withFileName: boolean) => {
    const play = resolvePipelineClipEffectivePlayback(
      clip,
      pipelineClips,
      totalSeconds,
      bgmPlayRanges,
      input.bgmFitToVideoEnd,
    );
    return {
      no: index + 1,
      ...(withFileName ? { fileName: fileNameOf(clip.file) } : {}),
      start: round2(clip.startTime),
      sourceLength: round2(clip.duration),
      trimIn: round2(clip.trimStart),
      trimOut: round2(clip.trimEnd),
      playStart: play.isDisabled ? null : round2(play.startTime),
      playEnd: play.isDisabled ? null : round2(play.effectiveTimelineEnd),
      mute: !!clip.isMuted,
      volumePercent: percent(clip.volume),
      fadeIn: fadeSeconds(clip.fadeIn, clip.fadeInDuration),
      fadeOut: fadeSeconds(clip.fadeOut, clip.fadeOutDuration),
    };
  };

  return {
    format: PROJECT_DIAGNOSTICS_FORMAT,
    formatVersion: PROJECT_DIAGNOSTICS_FORMAT_VERSION,
    appVersion: input.appVersion,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    output: {
      width: input.output.width,
      height: input.output.height,
      orientation: input.output.orientation,
      fps: input.output.fps,
    },
    timeline: {
      clipsSeconds: round2(clipsSeconds),
      endrollSeconds: round2(endrollSeconds),
      totalSeconds: round2(totalSeconds),
    },
    clips,
    bgm: {
      fitToVideoEnd: input.bgmFitToVideoEnd,
      clips: input.bgmClips.map((clip, index) => describeAudio(clip, index, true)),
    },
    // ナレーションは原稿・音声設定を含めず、配置と区間だけ出す。
    narrations: input.narrations.map((clip, index) => describeAudio(clip, index, false)),
    // キャプションは本文を含めず、表示区間だけ出す。
    captions: input.captions.map((caption, index) => ({
      no: index + 1,
      start: round2(caption.startTime),
      end: round2(caption.endTime),
    })),
  };
}

export type ProjectDiagnostics = ReturnType<typeof buildProjectDiagnostics>;
