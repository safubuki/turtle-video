/**
 * @file videoTitle.test.ts
 * @description 動画タイトル（Issue #211）の純ロジックの回帰テスト。
 *
 * 「キャプションとは別管理」「中央・大きめが既定」「表示時間が逆転しない」
 * 「旧保存データを壊さない」という仕様を固定する。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIDEO_TITLE_SETTINGS,
  VIDEO_TITLE_MIN_DURATION_SEC,
  clampVideoTitleBackgroundOpacity,
  clampVideoTitleBackgroundRadius,
  clampVideoTitleStrokeWidth,
  isVideoTitleActiveAtTime,
  normalizeVideoTitleRange,
  normalizeVideoTitleSettings,
  resolveVideoTitleAlpha,
  resolveVideoTitleBaseFontSize,
  resolveVideoTitleAnchor,
  resolveVideoTitleLines,
} from '../utils/videoTitle';
import {
  CAPTION_FONT_SIZE_PRESETS,
  CAPTION_STROKE_WIDTH_MAX,
  CAPTION_STROKE_WIDTH_MIN,
  clampCaptionStrokeWidth,
} from '../utils/captionStyle';
import type { VideoTitleSettings } from '../types';

const baseTitle = (overrides: Partial<VideoTitleSettings> = {}): VideoTitleSettings => ({
  ...DEFAULT_VIDEO_TITLE_SETTINGS,
  text: 'タイトル',
  ...overrides,
});

describe('動画タイトルの既定値（Issue #211）', () => {
  it('デフォルト位置は中央', () => {
    expect(DEFAULT_VIDEO_TITLE_SETTINGS.position).toBe('center');
    expect(DEFAULT_VIDEO_TITLE_SETTINGS.positionCustom).toBeNull();
  });

  it('デフォルト文字サイズは通常キャプションの既定（medium）より大きい', () => {
    // プリセット体系はキャプションと共通。既定は特大（148px）で medium(80px) より大きい
    expect(DEFAULT_VIDEO_TITLE_SETTINGS.fontSize).toBe('xlarge');
    expect(resolveVideoTitleBaseFontSize(DEFAULT_VIDEO_TITLE_SETTINGS)).toBeGreaterThan(
      CAPTION_FONT_SIZE_PRESETS.medium,
    );
  });

  it('初期テキストは空（未入力では描画されない）', () => {
    expect(DEFAULT_VIDEO_TITLE_SETTINGS.text).toBe('');
    expect(isVideoTitleActiveAtTime(DEFAULT_VIDEO_TITLE_SETTINGS, 0)).toBe(false);
  });

  it('既定の表示時間は 0〜4 秒', () => {
    expect(DEFAULT_VIDEO_TITLE_SETTINGS.startTime).toBe(0);
    expect(DEFAULT_VIDEO_TITLE_SETTINGS.endTime).toBe(4);
  });

  it('開始フェードは OFF、終了フェードは 1 秒で ON', () => {
    expect(DEFAULT_VIDEO_TITLE_SETTINGS.fadeIn).toBe(false);
    expect(DEFAULT_VIDEO_TITLE_SETTINGS.fadeOut).toBe(true);
    expect(DEFAULT_VIDEO_TITLE_SETTINGS.fadeOutDuration).toBe(1);
  });

  it('既定では頭のフレームからフル表示される（開始フェードなし）', () => {
    const title = { ...DEFAULT_VIDEO_TITLE_SETTINGS, text: 'タイトル' };
    expect(resolveVideoTitleAlpha(title, 0)).toBe(1);
    // 終了 1 秒前からフェードアウトが始まる
    expect(resolveVideoTitleAlpha(title, 3.5)).toBeCloseTo(0.5, 5);
  });
});

describe('clamp', () => {
  it('サイズはプリセット優先、カスタム値があればそちらを使う（キャプションと同じ体系）', () => {
    expect(resolveVideoTitleBaseFontSize({ fontSize: 'small', fontSizeCustom: null })).toBe(
      CAPTION_FONT_SIZE_PRESETS.small,
    );
    expect(resolveVideoTitleBaseFontSize({ fontSize: 'xlarge', fontSizeCustom: null })).toBe(
      CAPTION_FONT_SIZE_PRESETS.xlarge,
    );
    // カスタム値はプリセットより優先され、24〜240px にクランプされる
    expect(resolveVideoTitleBaseFontSize({ fontSize: 'small', fontSizeCustom: 200 })).toBe(200);
    expect(resolveVideoTitleBaseFontSize({ fontSize: 'small', fontSizeCustom: 9999 })).toBe(240);
    expect(resolveVideoTitleBaseFontSize({ fontSize: 'small', fontSizeCustom: 1 })).toBe(24);
  });

  it('縁幅はキャプションと同じ範囲（0〜20px・0.5px 刻み）', () => {
    expect(clampVideoTitleStrokeWidth(3.3)).toBe(3.5);
    expect(clampVideoTitleStrokeWidth(-5)).toBe(CAPTION_STROKE_WIDTH_MIN);
    expect(clampVideoTitleStrokeWidth(1000)).toBe(CAPTION_STROKE_WIDTH_MAX);
    // キャプション側の実装と完全に一致する
    expect(clampVideoTitleStrokeWidth(7.7)).toBe(clampCaptionStrokeWidth(7.7));
  });

  it('背景の濃さは 0〜1 に収める', () => {
    expect(clampVideoTitleBackgroundOpacity(-1)).toBe(0);
    expect(clampVideoTitleBackgroundOpacity(5)).toBe(1);
  });

  it('背景の角丸は 0〜80px の整数に収める', () => {
    expect(clampVideoTitleBackgroundRadius(-10)).toBe(0);
    expect(clampVideoTitleBackgroundRadius(999)).toBe(80);
    expect(clampVideoTitleBackgroundRadius(12.4)).toBe(12);
    expect(clampVideoTitleBackgroundRadius(Number.NaN)).toBe(
      DEFAULT_VIDEO_TITLE_SETTINGS.backgroundRadius,
    );
  });
});

describe('normalizeVideoTitleRange', () => {
  it('0.1 秒刻みへ量子化し、負値は 0 へ', () => {
    expect(normalizeVideoTitleRange(-3, 2.44)).toEqual({ startTime: 0, endTime: 2.4 });
  });

  it('終了が開始以下なら最小表示時間を確保する（逆転しない）', () => {
    const result = normalizeVideoTitleRange(5, 5);
    expect(result.endTime).toBeGreaterThan(result.startTime);
    expect(result.endTime - result.startTime).toBeCloseTo(VIDEO_TITLE_MIN_DURATION_SEC, 5);
  });

  it('終了が開始より前でも逆転させない', () => {
    const result = normalizeVideoTitleRange(8, 2);
    expect(result.startTime).toBe(8);
    expect(result.endTime).toBeGreaterThan(8);
  });

  it('totalDuration を超えないよう収める', () => {
    const result = normalizeVideoTitleRange(0, 30, 10);
    expect(result.endTime).toBe(10);
  });

  it('開始が totalDuration を超える場合も表示時間を確保する', () => {
    const result = normalizeVideoTitleRange(50, 60, 10);
    expect(result.endTime).toBeLessThanOrEqual(10);
    expect(result.endTime).toBeGreaterThan(result.startTime);
  });
});

describe('resolveVideoTitleLines / isVideoTitleActiveAtTime', () => {
  it('空行を除去する', () => {
    expect(resolveVideoTitleLines('  一行目 \n\n 二行目  \n')).toEqual(['一行目', '二行目']);
  });

  it('空白だけのテキストは描画対象にならない', () => {
    expect(isVideoTitleActiveAtTime(baseTitle({ text: '   \n  ' }), 1)).toBe(false);
  });

  it('enabled=false では描画しない', () => {
    expect(isVideoTitleActiveAtTime(baseTitle({ enabled: false }), 1)).toBe(false);
  });

  it('[startTime, endTime) の半開区間で判定する', () => {
    const title = baseTitle({ startTime: 1, endTime: 3 });
    expect(isVideoTitleActiveAtTime(title, 0.99)).toBe(false);
    expect(isVideoTitleActiveAtTime(title, 1)).toBe(true);
    expect(isVideoTitleActiveAtTime(title, 2.99)).toBe(true);
    expect(isVideoTitleActiveAtTime(title, 3)).toBe(false);
  });
});

describe('resolveVideoTitleAnchor', () => {
  const layout = { canvasWidth: 1920, canvasHeight: 1080, blockHeight: 200, padding: 50 };

  it('中央は常にキャンバス中心', () => {
    expect(resolveVideoTitleAnchor(baseTitle({ position: 'center' }), layout)).toEqual({
      x: 960,
      y: 540,
    });
  });

  it('上部・下部はブロック高さと余白を考慮する', () => {
    expect(resolveVideoTitleAnchor(baseTitle({ position: 'top' }), layout).y).toBe(150);
    expect(resolveVideoTitleAnchor(baseTitle({ position: 'bottom' }), layout).y).toBe(930);
  });

  it('カスタム XY はプリセットより優先される', () => {
    const anchor = resolveVideoTitleAnchor(
      baseTitle({ position: 'top', positionCustom: { x: 25, y: 75 } }),
      layout,
    );
    expect(anchor).toEqual({ x: 480, y: 810 });
  });

  it('カスタム XY は 0〜100% にクランプされる', () => {
    const anchor = resolveVideoTitleAnchor(
      baseTitle({ positionCustom: { x: -50, y: 500 } }),
      layout,
    );
    expect(anchor).toEqual({ x: 0, y: 1080 });
  });
});

describe('resolveVideoTitleAlpha', () => {
  it('フェード無効なら常に 1', () => {
    const title = baseTitle({ startTime: 0, endTime: 4, fadeIn: false, fadeOut: false });
    expect(resolveVideoTitleAlpha(title, 0)).toBe(1);
    expect(resolveVideoTitleAlpha(title, 3.9)).toBe(1);
  });

  it('フェードイン中は線形に立ち上がる', () => {
    const title = baseTitle({
      startTime: 0,
      endTime: 10,
      fadeIn: true,
      fadeInDuration: 1,
      fadeOut: false,
    });
    expect(resolveVideoTitleAlpha(title, 0)).toBe(0);
    expect(resolveVideoTitleAlpha(title, 0.5)).toBeCloseTo(0.5, 5);
    expect(resolveVideoTitleAlpha(title, 1)).toBe(1);
  });

  it('フェードアウト中は線形に落ちる', () => {
    const title = baseTitle({
      startTime: 0,
      endTime: 10,
      fadeIn: false,
      fadeOut: true,
      fadeOutDuration: 2,
    });
    expect(resolveVideoTitleAlpha(title, 9)).toBeCloseTo(0.5, 5);
    expect(resolveVideoTitleAlpha(title, 10)).toBe(0);
  });

  it('フェード合計が表示時間を超える場合は按分して途切れない', () => {
    const title = baseTitle({
      startTime: 0,
      endTime: 1,
      fadeIn: true,
      fadeInDuration: 3,
      fadeOut: true,
      fadeOutDuration: 3,
    });
    // 按分後は in=out=0.5 秒。中央で 1.0 に到達する
    expect(resolveVideoTitleAlpha(title, 0.5)).toBeCloseTo(1, 5);
    expect(resolveVideoTitleAlpha(title, 0)).toBe(0);
  });
});

describe('normalizeVideoTitleSettings（保存データの後方互換）', () => {
  it('undefined（タイトル未対応の旧データ）は既定値になる', () => {
    expect(normalizeVideoTitleSettings(undefined)).toEqual(DEFAULT_VIDEO_TITLE_SETTINGS);
    expect(normalizeVideoTitleSettings(null)).toEqual(DEFAULT_VIDEO_TITLE_SETTINGS);
  });

  it('欠けたフィールドは既定値で補完する', () => {
    const restored = normalizeVideoTitleSettings({ text: '保存済み' });
    expect(restored.text).toBe('保存済み');
    expect(restored.position).toBe('center');
    expect(restored.fontSize).toBe(DEFAULT_VIDEO_TITLE_SETTINGS.fontSize);
  });

  it('壊れた数値・時間は正規化する', () => {
    const restored = normalizeVideoTitleSettings({
      fontSizeCustom: 99999,
      strokeWidth: -10,
      backgroundOpacity: 42,
      startTime: -5,
      endTime: -9,
      positionCustom: { x: 900, y: -20 },
    });
    expect(restored.fontSizeCustom).toBe(240);
    expect(restored.strokeWidth).toBe(0);
    expect(restored.backgroundOpacity).toBe(1);
    expect(restored.startTime).toBe(0);
    expect(restored.endTime).toBeGreaterThan(0);
    expect(restored.positionCustom).toEqual({ x: 100, y: 0 });
  });
});
