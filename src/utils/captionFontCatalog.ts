/**
 * @file captionFontCatalog.ts
 * @author Turtle Village
 * @description キャプション字体（CaptionFontStyle）→ CSS フォントスタックの単一カタログ。
 *
 * - フォントファイルは同梱せず、端末のシステムフォントに解決されるスタックを使う。
 * - ドロップダウンには fontAvailability の実在判定を通過したフォントのみを表示し、
 *   「選んだのに見た目が変わらない（総称ファミリへのフォールバック）」を防ぐ。
 * - `local:<ファミリ名>` 形式の値は Local Font Access API（PC）で選んだ任意フォントを表す。
 * - 拡張フォントの選択 UI は standard フレーバー（Android/PC）限定。
 *   描画はどのフレーバーでもこのカタログで解決し、未知値は sans-serif へフォールバックする
 *   （拡張フォントを含むプロジェクトを iOS で開いてもクラッシュ・描画不能にならない）。
 */
import type { CaptionFontStyle } from '../types';
import { isAnyFontFamilyAvailable } from './fontAvailability';

export interface CaptionFontOption {
  value: CaptionFontStyle;
  label: string;
  family: string;
  /** 拡張フォント（standard フレーバー限定 UI）かどうか */
  extended: boolean;
  /**
   * 実在判定に使うファミリ名候補。いずれかが端末に存在すれば選択肢として表示する。
   * 未指定は常に表示（総称ファミリ等、フォールバックしても意味が変わらないもの）。
   */
  detectFamilies?: string[];
  /** 過去データの描画互換のためだけに残す値（UI には出さない） */
  legacyOnly?: boolean;
}

export const CAPTION_FONT_FALLBACK_FAMILY = 'sans-serif';

/** `local:<family>` — 端末フォント（Local Font Access API）で選んだ任意フォントの値プレフィックス */
export const LOCAL_FONT_VALUE_PREFIX = 'local:';

export function createLocalFontValue(family: string): CaptionFontStyle {
  return `${LOCAL_FONT_VALUE_PREFIX}${family}`;
}

export function getLocalFontFamilyFromValue(value: string): string | null {
  if (!value.startsWith(LOCAL_FONT_VALUE_PREFIX)) return null;
  const family = value.slice(LOCAL_FONT_VALUE_PREFIX.length).trim();
  return family.length > 0 ? family : null;
}

export const CAPTION_FONT_OPTIONS: CaptionFontOption[] = [
  // === 基本（全フレーバー共通） ===
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
  // === 固定 3 つ目（実在時のみ表示） ===
  {
    value: 'rounded',
    label: '丸ゴシック',
    family: '"M PLUS Rounded 1c", "ヒラギノ丸ゴ ProN", "Hiragino Maru Gothic ProN", "HGMaruGothicMPRO", "HG丸ｺﾞｼｯｸM-PRO", sans-serif',
    extended: true,
    detectFamilies: ['M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'HGMaruGothicMPRO', 'HG丸ｺﾞｼｯｸM-PRO'],
  },
  // === ドロップダウン候補（実在判定つき・Word/Excel 等でおなじみの日本語フォント中心） ===
  {
    value: 'yu-gothic',
    label: '游ゴシック',
    family: '"Yu Gothic", "游ゴシック", YuGothic, sans-serif',
    extended: true,
    detectFamilies: ['Yu Gothic', 'YuGothic'],
  },
  {
    value: 'meiryo',
    label: 'メイリオ',
    family: 'Meiryo, "メイリオ", sans-serif',
    extended: true,
    detectFamilies: ['Meiryo'],
  },
  {
    value: 'ms-gothic',
    label: 'ＭＳ ゴシック',
    family: '"MS Gothic", "ＭＳ ゴシック", sans-serif',
    extended: true,
    detectFamilies: ['MS Gothic'],
  },
  {
    value: 'ms-mincho',
    label: 'ＭＳ 明朝',
    family: '"MS Mincho", "ＭＳ 明朝", serif',
    extended: true,
    detectFamilies: ['MS Mincho'],
  },
  {
    value: 'biz-ud-gothic',
    label: 'BIZ UDゴシック',
    family: '"BIZ UDGothic", "BIZ UDゴシック", sans-serif',
    extended: true,
    detectFamilies: ['BIZ UDGothic'],
  },
  {
    value: 'biz-ud-mincho',
    label: 'BIZ UD明朝',
    family: '"BIZ UDMincho", "BIZ UD明朝", serif',
    extended: true,
    detectFamilies: ['BIZ UDMincho'],
  },
  {
    value: 'ud-kyokasho',
    label: 'UD教科書体',
    family: '"UD デジタル 教科書体 N-R", "UD Digi Kyokasho N-R", "UD デジタル 教科書体 NK-R", "UD Digi Kyokasho NK-R", sans-serif',
    extended: true,
    detectFamilies: ['UD デジタル 教科書体 N-R', 'UD Digi Kyokasho N-R', 'UD Digi Kyokasho NK-R'],
  },
  {
    value: 'gyosho',
    label: '行書体',
    family: '"HG行書体", "HGGyoshotai", cursive',
    extended: true,
    detectFamilies: ['HG行書体', 'HGGyoshotai'],
  },
  {
    value: 'souei-pop',
    label: '創英角ポップ体',
    family: '"HGP創英角ﾎﾟｯﾌﾟ体", "HG創英角ﾎﾟｯﾌﾟ体", "HGSoeiKakupoptai", fantasy',
    extended: true,
    detectFamilies: ['HGP創英角ﾎﾟｯﾌﾟ体', 'HG創英角ﾎﾟｯﾌﾟ体', 'HGSoeiKakupoptai'],
  },
  {
    value: 'klee',
    label: 'クレー（手書き）',
    family: '"Klee One", Klee, "クレー", cursive',
    extended: true,
    detectFamilies: ['Klee One', 'Klee'],
  },
  {
    value: 'segoe-script',
    label: 'Segoe Script (英手書き)',
    family: '"Segoe Script", "Comic Sans MS", cursive',
    extended: true,
    detectFamilies: ['Segoe Script'],
  },
  {
    value: 'comic-sans',
    label: 'Comic Sans (英ポップ)',
    family: '"Comic Sans MS", cursive',
    extended: true,
    detectFamilies: ['Comic Sans MS'],
  },
  {
    value: 'impact',
    label: 'Impact (極太)',
    family: 'Impact, "Arial Black", sans-serif',
    extended: true,
    detectFamilies: ['Impact', 'Arial Black'],
  },
  {
    value: 'times',
    label: 'Times New Roman',
    family: '"Times New Roman", Times, serif',
    extended: true,
    detectFamilies: ['Times New Roman'],
  },
  {
    value: 'noto-sans-jp',
    label: 'Noto Sans JP',
    family: '"Noto Sans JP", "Noto Sans CJK JP", sans-serif',
    extended: true,
    detectFamilies: ['Noto Sans JP', 'Noto Sans CJK JP'],
  },
  {
    value: 'noto-serif-jp',
    label: 'Noto Serif JP',
    family: '"Noto Serif JP", "Noto Serif CJK JP", serif',
    extended: true,
    detectFamilies: ['Noto Serif JP', 'Noto Serif CJK JP'],
  },
  // === 総称ファミリ（常に表示・端末の既定に従う） ===
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
  // === 過去データ互換のみ（UI 非表示。実在フォントに解決されない場合があったため廃止） ===
  {
    value: 'handwriting',
    label: '手書き風',
    family: '"Klee One", "UD デジタル 教科書体 N-R", "UD Digi Kyokasho N-R", "Yu Kyokasho", "YuKyokasho", cursive',
    extended: true,
    legacyOnly: true,
  },
];

const familyByStyle: Record<string, string> = Object.fromEntries(
  CAPTION_FONT_OPTIONS.map((option) => [option.value, option.family]),
);

/**
 * 字体 → CSS フォントファミリ文字列を解決する。
 * `local:<family>` は端末フォントとしてそのまま解決し、
 * 未知値（将来追加された値を旧バージョンで開いた場合など）は sans-serif へフォールバック。
 */
export function resolveCaptionFontFamily(style: CaptionFontStyle | undefined | null): string {
  if (!style) return CAPTION_FONT_FALLBACK_FAMILY;
  const localFamily = getLocalFontFamilyFromValue(style);
  if (localFamily) {
    return `"${localFamily.replace(/"/g, '')}", ${CAPTION_FONT_FALLBACK_FAMILY}`;
  }
  return familyByStyle[style] ?? CAPTION_FONT_FALLBACK_FAMILY;
}

/** 基本 2 択（全フレーバー共通 UI） */
export const BASIC_CAPTION_FONT_OPTIONS = CAPTION_FONT_OPTIONS.filter((o) => !o.extended);

/** 拡張フォント（standard フレーバー限定 UI）。legacy 値も含む（描画互換用） */
export const EXTENDED_CAPTION_FONT_OPTIONS = CAPTION_FONT_OPTIONS.filter((o) => o.extended);

/** standard の固定表示候補（ゴシック/明朝 + 実在すれば丸ゴシック） */
const PINNED_VALUES: CaptionFontStyle[] = ['gothic', 'mincho', 'rounded'];
export const PINNED_CAPTION_FONT_OPTIONS = CAPTION_FONT_OPTIONS.filter((o) =>
  PINNED_VALUES.includes(o.value),
);

/** ドロップダウン候補（固定・legacy を除く全拡張フォント。実在判定前） */
export const DROPDOWN_CAPTION_FONT_OPTIONS = CAPTION_FONT_OPTIONS.filter(
  (o) => o.extended && !o.legacyOnly && !PINNED_VALUES.includes(o.value),
);

type FontDetector = (families: string[]) => boolean;

/**
 * 端末に実在するフォントだけに絞った固定表示オプションを返す。
 * （丸ゴシックは実在しない端末では表示しない — 「選んだのに変わらない」を防ぐ）
 */
export function getAvailablePinnedFontOptions(
  detect: FontDetector = isAnyFontFamilyAvailable,
): CaptionFontOption[] {
  return PINNED_CAPTION_FONT_OPTIONS.filter(
    (o) => !o.detectFamilies || detect(o.detectFamilies),
  );
}

/** 端末に実在するフォントだけに絞ったドロップダウンオプションを返す */
export function getAvailableDropdownFontOptions(
  detect: FontDetector = isAnyFontFamilyAvailable,
): CaptionFontOption[] {
  return DROPDOWN_CAPTION_FONT_OPTIONS.filter(
    (o) => !o.detectFamilies || detect(o.detectFamilies),
  );
}

/** 指定の字体が拡張フォント（基本 2 択以外）かどうか */
export function isExtendedCaptionFontStyle(style: CaptionFontStyle | undefined | null): boolean {
  if (!style) return false;
  if (getLocalFontFamilyFromValue(style)) return true;
  return EXTENDED_CAPTION_FONT_OPTIONS.some((o) => o.value === style);
}
