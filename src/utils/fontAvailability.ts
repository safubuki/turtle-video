/**
 * @file fontAvailability.ts
 * @author Turtle Village
 * @description 端末にフォントが実在するかを canvas の文字幅計測で判定するユーティリティ。
 * 「候補フォントを前置したスタック」と「総称ファミリ単体」の描画幅が異なれば実在とみなす
 * （Android Chrome にはフォント列挙 API が無いため、この方式が唯一の実在確認手段）。
 * 判定結果はキャッシュする。canvas が使えない環境（テスト等）では false を返す。
 */

const SAMPLE_TEXT = 'あア亜のっぽWmi19';
const SAMPLE_SIZE = 40;
const BASE_FAMILIES = ['monospace', 'serif', 'sans-serif'] as const;

const availabilityCache = new Map<string, boolean>();
let measureCtx: CanvasRenderingContext2D | null | undefined;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureCtx === undefined) {
    try {
      measureCtx = document.createElement('canvas').getContext('2d');
    } catch {
      measureCtx = null;
    }
  }
  return measureCtx;
}

/** 単一のフォントファミリ名が端末に実在するか */
export function isFontFamilyAvailable(family: string): boolean {
  const trimmed = family.trim();
  if (!trimmed) return false;
  const cached = availabilityCache.get(trimmed);
  if (cached !== undefined) return cached;

  const ctx = getMeasureContext();
  if (!ctx) {
    availabilityCache.set(trimmed, false);
    return false;
  }

  let available = false;
  try {
    for (const base of BASE_FAMILIES) {
      ctx.font = `${SAMPLE_SIZE}px ${base}`;
      const baseWidth = ctx.measureText(SAMPLE_TEXT).width;
      ctx.font = `${SAMPLE_SIZE}px "${trimmed}", ${base}`;
      const candidateWidth = ctx.measureText(SAMPLE_TEXT).width;
      if (baseWidth !== candidateWidth) {
        available = true;
        break;
      }
    }
  } catch {
    available = false;
  }

  availabilityCache.set(trimmed, available);
  return available;
}

/** 候補ファミリ群のいずれかが実在するか */
export function isAnyFontFamilyAvailable(families: string[]): boolean {
  return families.some((family) => isFontFamilyAvailable(family));
}

/** Local Font Access API（PC の Chromium 系のみ）が使えるか */
export function supportsLocalFontAccess(): boolean {
  return typeof window !== 'undefined' && 'queryLocalFonts' in window;
}

interface LocalFontData {
  family: string;
}

/**
 * 端末にインストールされた全フォントのファミリ名一覧を取得する（要ユーザー許可）。
 * 非対応環境・拒否時は空配列を返す。
 */
export async function queryLocalFontFamilies(): Promise<string[]> {
  if (!supportsLocalFontAccess()) return [];
  try {
    const fonts = await (window as unknown as {
      queryLocalFonts: () => Promise<LocalFontData[]>;
    }).queryLocalFonts();
    const families = new Set<string>();
    for (const font of fonts) {
      if (font.family) families.add(font.family);
    }
    return [...families].sort((a, b) => a.localeCompare(b, 'ja'));
  } catch {
    // 権限拒否・失敗時は静かに空を返す（UI 側でトースト等は出さない）
    return [];
  }
}
