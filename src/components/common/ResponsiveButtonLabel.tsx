/**
 * @file ResponsiveButtonLabel.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description 幅の狭い画面でだけ短縮ラベルへ切り替えるボタン内ラベル。
 *
 * キャプション個別設定モーダルは「デフォルト」が 1 つ増える分ボタンが多く、
 * スマホ幅では正式名称のままだと折り返す。一方 PC ではモーダルを `md:max-w-2xl` へ
 * 広げるため、短縮すると「ゴシ」のように意味が取れず一括設定とも見た目がズレる。
 *
 * そこで **両方のラベルを描いて CSS で出し分ける**。判定はモーダルが広がるのと
 * 同じ `md` ブレークポイントに揃えるため、PC では一括設定と完全に同じ表示になる。
 * （JS のメディアクエリ監視は不要で、リサイズ中もチラつかない）
 */
import React from 'react';

interface ResponsiveButtonLabelProps {
  /** 通常（PC / 幅に余裕がある場合）の正式名称 */
  full: string;
  /**
   * 狭い画面で使う短縮名。未指定なら常に `full` を出す
   * （短縮の必要が無いラベル）。
   */
  short?: string;
  /**
   * 短縮の出し分けを有効にするか。false なら常に `full`。
   * 一括設定・動画タイトルのように幅に余裕がある場所では false。
   */
  enabled?: boolean;
}

const ResponsiveButtonLabel: React.FC<ResponsiveButtonLabelProps> = ({
  full,
  short,
  enabled = false,
}) => {
  if (!enabled || !short || short === full) {
    return <>{full}</>;
  }

  // 両方を DOM に置くため、そのままだと読み上げ名が「デフォルト既定」のように
  // 連結される。表示専用として aria-hidden で隠し、呼び出し側が付ける
  // aria-label（正式名称）だけがアクセシブル名になるようにする。
  return (
    <>
      {/* md 未満（スマホ）: 短縮。md 以上（PC）: 正式名称＝一括設定と同じ表示 */}
      <span className="md:hidden" aria-hidden="true">{short}</span>
      <span className="hidden md:inline" aria-hidden="true">{full}</span>
    </>
  );
};

export default ResponsiveButtonLabel;
