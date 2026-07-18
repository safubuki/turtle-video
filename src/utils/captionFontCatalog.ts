/**
 * @file captionFontCatalog.ts
 * @author Turtle Village
 * @description キャプション字体（CaptionFontStyle）→ CSS フォントスタックの単一カタログ。
 *
 * - フォントファイルは同梱せず、端末のシステムフォントに解決される厳選スタックを使う。
 *   端末に無いフォントは各スタック末尾の総称ファミリ（sans-serif 等）へ自然にフォールバックする。
 * - 拡張フォント（rounded 以降）の選択 UI は standard フレーバー（Android/PC）限定。
 *   描画側はどのフレーバーでもこのカタログで解決し、未知値は sans-serif へフォールバックする
 *   （拡張フォントを含むプロジェクトを iOS で開いてもクラッシュ・描画不能にならない）。
 */
import type { CaptionFontStyle } from '../types';

export interface CaptionFontOption {
  value: CaptionFontStyle;
  label: string;
  family: string;
  /** 拡張フォント（standard フレーバー限定 UI）かどうか */
  extended: boolean;
}

export const CAPTION_FONT_FALLBACK_FAMILY = 'sans-serif';

export const CAPTION_FONT_OPTIONS: CaptionFontOption[] = [
  {
    value: 'gothic',
    label: 'ゴシック',
    family: 'sans-serif',
    extended: false,
  },
  {
    value: 'mincho',
    label: '明朝',
    family: '"游明朝", "Yu Mincho", "ヒラギノ明朝 ProN", "Hiragino Mincho ProN", "Noto Serif JP", "Noto Serif CJK JP", serif',
    extended: false,
  },
  {
    value: 'rounded',
    label: '丸ゴシック',
    family: '"M PLUS Rounded 1c", "ヒラギノ丸ゴ ProN", "Hiragino Maru Gothic ProN", "HGMaruGothicMPRO", "HG丸ｺﾞｼｯｸM-PRO", sans-serif',
    extended: true,
  },
  {
    value: 'handwriting',
    label: '手書き風',
    family: '"Klee One", "UD デジタル 教科書体 N-R", "UD Digi Kyokasho N-R", "Yu Kyokasho", "YuKyokasho", cursive',
    extended: true,
  },
  {
    value: 'mono',
    label: '等幅',
    family: 'Consolas, Menlo, "MS Gothic", "ＭＳ ゴシック", monospace',
    extended: true,
  },
  {
    value: 'system',
    label: '端末標準',
    family: 'system-ui',
    extended: true,
  },
];

const familyByStyle: Record<string, string> = Object.fromEntries(
  CAPTION_FONT_OPTIONS.map((option) => [option.value, option.family]),
);

/**
 * 字体 → CSS フォントファミリ文字列を解決する。
 * 未知値（将来追加された値を旧バージョンで開いた場合など）は sans-serif へフォールバック。
 */
export function resolveCaptionFontFamily(style: CaptionFontStyle | undefined | null): string {
  if (!style) return CAPTION_FONT_FALLBACK_FAMILY;
  return familyByStyle[style] ?? CAPTION_FONT_FALLBACK_FAMILY;
}

/** 基本 2 択（全フレーバー共通 UI） */
export const BASIC_CAPTION_FONT_OPTIONS = CAPTION_FONT_OPTIONS.filter((o) => !o.extended);

/** 拡張フォント（standard フレーバー限定 UI） */
export const EXTENDED_CAPTION_FONT_OPTIONS = CAPTION_FONT_OPTIONS.filter((o) => o.extended);

/** standard の固定表示 3 種（ゴシック/明朝/丸ゴシック）。それ以外はドロップダウンで選択 */
const PINNED_VALUES: CaptionFontStyle[] = ['gothic', 'mincho', 'rounded'];
export const PINNED_CAPTION_FONT_OPTIONS = CAPTION_FONT_OPTIONS.filter((o) =>
  PINNED_VALUES.includes(o.value),
);
export const DROPDOWN_CAPTION_FONT_OPTIONS = CAPTION_FONT_OPTIONS.filter(
  (o) => !PINNED_VALUES.includes(o.value),
);

/** 指定の字体が拡張フォントかどうか */
export function isExtendedCaptionFontStyle(style: CaptionFontStyle | undefined | null): boolean {
  return EXTENDED_CAPTION_FONT_OPTIONS.some((o) => o.value === style);
}
