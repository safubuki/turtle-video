/**
 * @file CaptionFontStyleField.tsx
 * @author Turtle Village
 * @description 字体設定（固定ボタン + 「その他▾」ドロップダウン + PC の全フォント読み込み）の共通コントロール。
 *
 * キャプションの一括スタイル設定・キャプション個別設定モーダル・動画タイトル設定
 * （Issue #211）が **同じ見た目・同じ操作感**になるよう、実装をここへ 1 本化する。
 * 拡張フォント（システムフォント/端末フォント）は standard フレーバー限定のため
 * `supportsExtendedFonts` で切り替える。
 *
 * 端末フォント（Local Font Access API）の読み込み結果は呼び出し側が保持する。
 * キャプションとタイトルで同じ一覧を共有できるよう、state を上へ持ち上げている。
 *
 * ## 個別設定（override）モード
 *
 * `allowDefaultOption` を立てると先頭に「デフォルト」ボタンが増え、`fontStyle` に
 * `null` を渡せるようになる（= 一括設定を継承）。個別設定モーダルは
 * 以前この UI を自前実装していたため丸ゴシック等の固定ボタンが欠落していたが、
 * 共有化によって一括設定と同じ選択肢が常に並ぶ。
 */
import React from 'react';
import type { CaptionFontStyle } from '../../types';
import {
  BASIC_CAPTION_FONT_OPTIONS,
  createLocalFontValue,
  getAvailableDropdownFontOptions,
  getAvailablePinnedFontOptions,
  getLocalFontFamilyFromValue,
  isExtendedCaptionFontStyle,
  resolveCaptionFontFamily,
} from '../../utils/captionFontCatalog';
import { supportsLocalFontAccess } from '../../utils/fontAvailability';
import ResponsiveButtonLabel from './ResponsiveButtonLabel';

interface CaptionFontStyleFieldProps {
  /** 選択中の字体。個別設定で未指定（一括設定を継承）のときは null */
  fontStyle: CaptionFontStyle | null;
  disabled?: boolean;
  /** システムフォント拡張を許可するか（standard フレーバー限定機能） */
  supportsExtendedFonts: boolean;
  /**
   * 「デフォルト」（一括設定を継承）を選べるようにするか。
   * キャプション個別設定モーダル用。選択時は `onSetFontStyle(null)` を呼ぶ。
   */
  allowDefaultOption?: boolean;
  /**
   * 幅が狭い場所（個別設定モーダル）向けのレイアウト。
   * 「デフォルト」が増えてボタンが 1 つ多くなるため、**スマホ幅でだけ**
   * 短縮ラベル・詰めたラベル列に切り替えて折り返しを防ぐ。
   * PC（md 以上）ではモーダルが横広になるので一括設定と同じ表示に戻る。
   */
  compact?: boolean;
  /** 固定表示する追加フォント（実在する丸ゴシック等） */
  pinnedFontOptions: ReturnType<typeof getAvailablePinnedFontOptions>;
  /** 「その他▾」に並べるフォント */
  dropdownFontOptions: ReturnType<typeof getAvailableDropdownFontOptions>;
  /** Local Font Access API で読み込み済みの端末フォント */
  localFontFamilies: string[];
  /** 端末フォント読み込み中か */
  localFontsLoading: boolean;
  /** select 要素の id 接頭辞（同一画面に複数置くため一意化する） */
  idPrefix: string;
  onSetFontStyle: (style: CaptionFontStyle | null) => void;
  onLoadLocalFonts: () => void;
}

const CaptionFontStyleField = React.memo<CaptionFontStyleFieldProps>(({
  fontStyle,
  disabled = false,
  supportsExtendedFonts,
  allowDefaultOption = false,
  compact = false,
  pinnedFontOptions,
  dropdownFontOptions,
  localFontFamilies,
  localFontsLoading,
  idPrefix,
  onSetFontStyle,
  onLoadLocalFonts,
}) => {
  const fontStyleOptions = supportsExtendedFonts
    ? [...BASIC_CAPTION_FONT_OPTIONS, ...pinnedFontOptions.filter((o) => o.extended)]
    : BASIC_CAPTION_FONT_OPTIONS;

  const isDefaultSelected = allowDefaultOption && fontStyle === null;
  const selectedLocalFamily = fontStyle ? getLocalFontFamilyFromValue(fontStyle) : null;
  const isPinnedFontSelected =
    fontStyle !== null &&
    (pinnedFontOptions.some((o) => o.value === fontStyle) ||
      BASIC_CAPTION_FONT_OPTIONS.some((o) => o.value === fontStyle));
  const isDropdownFontSelected =
    fontStyle !== null && !isPinnedFontSelected && isExtendedCaptionFontStyle(fontStyle);
  const dropdownFontValue = isDropdownFontSelected ? fontStyle : '';
  // 復元データ等で「選択中だが一覧に無い」値も表示できるよう補完する
  const dropdownHasSelected =
    !dropdownFontValue ||
    dropdownFontOptions.some((o) => o.value === dropdownFontValue) ||
    (selectedLocalFamily !== null && localFontFamilies.includes(selectedLocalFamily));

  const canLoadLocalFonts = supportsExtendedFonts && supportsLocalFontAccess();

  return (
    <>
      <div className="flex items-center gap-2 text-[10px] md:text-xs">
        <span className={`text-gray-400 shrink-0 ${compact ? 'w-10 md:w-16' : 'w-16'}`}>字体:</span>
        <div className="flex gap-1 flex-1 items-stretch min-w-0">
          {/* 個別設定のみ: 一括設定を継承する「デフォルト」 */}
          {allowDefaultOption && (
            <button
              onClick={() => onSetFontStyle(null)}
              disabled={disabled}
              className={`flex-1 min-w-0 px-0.5 py-1 rounded transition whitespace-nowrap ${
                isDefaultSelected
                  ? 'bg-yellow-500 text-gray-900'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              } disabled:opacity-50`}
              title="一括設定の字体に従う"
              aria-label="デフォルト"
            >
              <ResponsiveButtonLabel full="デフォルト" short="既定" enabled={compact} />
            </button>
          )}
          {fontStyleOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onSetFontStyle(opt.value)}
              disabled={disabled}
              className={`flex-1 min-w-0 px-0.5 py-1 rounded transition whitespace-nowrap ${
                fontStyle === opt.value
                  ? 'bg-yellow-500 text-gray-900'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              } disabled:opacity-50`}
              style={{ fontFamily: opt.family }}
              title={opt.label}
              aria-label={opt.label}
            >
              <ResponsiveButtonLabel full={opt.label} short={opt.shortLabel} enabled={compact} />
            </button>
          ))}
          {supportsExtendedFonts && (
            <select
              id={`${idPrefix}-font-style-dropdown`}
              value={dropdownFontValue}
              onChange={(e) => {
                const value = e.target.value as CaptionFontStyle | '';
                if (value) onSetFontStyle(value);
              }}
              disabled={disabled}
              className={`flex-1 min-w-0 max-w-[7.5rem] py-1 px-1 rounded transition text-[10px] md:text-xs bg-gray-700 focus:outline-none focus:ring-1 focus:ring-yellow-500 disabled:opacity-50 ${
                dropdownFontValue
                  ? 'text-yellow-300 ring-1 ring-yellow-500/70 font-semibold'
                  : 'text-gray-300 hover:bg-gray-600'
              }`}
              title="その他のシステムフォントから選ぶ（端末に実在するもののみ表示）"
            >
              <option value="" disabled className="bg-gray-800 text-gray-500">
                その他▾
              </option>
              {dropdownFontOptions.map((opt) => (
                <option
                  key={opt.value}
                  value={opt.value}
                  className="bg-gray-800 text-gray-200"
                  style={{ fontFamily: opt.family }}
                >
                  {opt.label}
                </option>
              ))}
              {localFontFamilies.length > 0 && (
                <optgroup label="端末のフォント" className="bg-gray-800 text-gray-400">
                  {localFontFamilies.map((family) => (
                    <option
                      key={family}
                      value={createLocalFontValue(family)}
                      className="bg-gray-800 text-gray-200"
                      style={{ fontFamily: family }}
                    >
                      {family}
                    </option>
                  ))}
                </optgroup>
              )}
              {!dropdownHasSelected && (
                <option
                  value={dropdownFontValue}
                  className="bg-gray-800 text-gray-200"
                  style={{ fontFamily: resolveCaptionFontFamily(dropdownFontValue) }}
                >
                  {selectedLocalFamily ?? dropdownFontValue}
                </option>
              )}
            </select>
          )}
        </div>
      </div>
      {/* PC: 端末の全フォント読み込み（Local Font Access API 対応環境のみ） */}
      {canLoadLocalFonts && localFontFamilies.length === 0 && (
        <div className={compact ? 'pl-10 md:pl-16' : 'pl-16'}>
          <button
            onClick={onLoadLocalFonts}
            disabled={disabled || localFontsLoading}
            className="text-[10px] text-blue-300 hover:text-blue-200 underline underline-offset-2 disabled:opacity-50"
            title="この PC にインストールされている全フォントを選択肢に追加します（許可が必要）"
          >
            {localFontsLoading ? '読み込み中…' : '＋ この端末の全フォントから選ぶ（PC）'}
          </button>
        </div>
      )}
    </>
  );
});

CaptionFontStyleField.displayName = 'CaptionFontStyleField';

export default CaptionFontStyleField;
