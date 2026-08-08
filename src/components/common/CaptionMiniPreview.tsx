/**
 * @file CaptionMiniPreview.tsx
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description キャプション設定中に、プレビューの現在位置の静止画へキャプションを重ねて
 * 表示する小型プレビュー。
 *
 * ## 目的
 *
 * キャプションのサイズ・位置・色は数値だけでは結果が分からず、これまでは
 * 「設定 → プレビューへスクロール → 確認 → 戻る」を往復する必要があった。
 * 個別設定はモーダルがプレビューを覆うため、特に確認しづらい。
 *
 * そこで設定 UI のすぐ横に、**プレビューの現在フレーム**を背景とした
 * ミニプレビューを置き、その場でサイズ・位置を確かめられるようにする。
 *
 * ## 実装方針
 *
 * - 背景はメインプレビューの canvas を `drawImage` で転写するだけ（再デコードしない）。
 *   メインプレビューは常に現在位置のフレームを保持しているため、これが最も安価で確実。
 * - キャプションは export と同じ純関数 `drawCaptionLayerFrame` で描く。
 *   見た目の解決（サイズ/位置/縁/色/背景帯/ぼかし）が本番描画と完全に一致する。
 * - 描画時刻は「そのキャプションが必ず表示される時刻」を使う（`previewTimeSec`）。
 *   フェード途中や表示範囲外でも文字が消えないよう、呼び出し側が中央時刻を渡す。
 * - 更新はプロパティ変更時のみの単発描画（rAF ループを回さない）。
 *   設定 UI は静止画で十分で、常時ループはモバイルの負荷になる。
 */
import React, { useCallback, useEffect, useRef } from 'react';
import type { Caption, CaptionSettings, VideoTitleSettings } from '../../types';
import { useCanvasStore } from '../../stores/canvasStore';
import { drawCaptionLayerFrame } from '../../utils/captionLayerRender';
import type { CaptionFreeSnapshot } from '../../utils/canvas';

interface CaptionMiniPreviewProps {
  /**
   * メインプレビューの canvas（背景フレームの転写元・フォールバック）。
   * こちらはキャプションが焼き込まれているため、`captionFreeSnapshotRef` が
   * 使えるときはそちらを優先する。
   */
  sourceCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  /**
   * キャプションを描く直前のフレーム（プレビューエンジンが毎フレーム保存）。
   * **これが本来の転写元**。メインプレビューをそのまま使うと、既に焼き込まれた
   * キャプションの上へ設定中のキャプションをもう 1 枚描くことになり、
   * サイズ変更時に前のサイズが残る／削除した文字が残る、といった二重表示になる。
   */
  captionFreeSnapshotRef?: React.MutableRefObject<CaptionFreeSnapshot>;
  /** 描画するキャプション（個別設定は 1 件、一括設定は表示中の全件） */
  captions: Caption[];
  settings: CaptionSettings;
  /** 動画タイトルも重ねる場合に渡す（一括設定用。個別設定では省略） */
  videoTitle?: VideoTitleSettings | null;
  /** 描画に使うタイムライン時刻（キャプションが確実に表示される時刻） */
  previewTimeSec: number;
  /** 枠の下に出す補足（「現在位置 0:03」など） */
  caption?: string;
  /** 背景フレームを再取得する契機（プレビューの現在位置が変わったとき等） */
  refreshKey?: number;
}

/** ミニプレビューの内部解像度。長辺基準で、文字の可読性とコストのバランスを取る */
const MINI_LONG_SIDE = 320;

const CaptionMiniPreview: React.FC<CaptionMiniPreviewProps> = ({
  sourceCanvasRef,
  captionFreeSnapshotRef,
  captions,
  settings,
  videoTitle = null,
  previewTimeSec,
  caption,
  refreshKey = 0,
}) => {
  const projectWidth = useCanvasStore((s) => s.width);
  const projectHeight = useCanvasStore((s) => s.height);
  const isPortrait = projectHeight > projectWidth;

  // 出力の向き（16:9 / 9:16）に合わせる。キャプションの位置・サイズは
  // 短辺基準でスケールされるため、比率さえ合っていれば本番と同じ見え方になる。
  const aspect = projectWidth > 0 && projectHeight > 0 ? projectWidth / projectHeight : 16 / 9;
  const width = isPortrait ? Math.round(MINI_LONG_SIDE * aspect) : MINI_LONG_SIDE;
  const height = isPortrait ? MINI_LONG_SIDE : Math.round(MINI_LONG_SIDE / aspect);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const renderMiniFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // 1) 背景: メインプレビューの現在フレームを転写する。
    //    プレビューがまだ描かれていない場合は黒で塗り、キャプションだけ確認できるようにする。
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // キャプション抜きのスナップショットを最優先で使う。
    // 無い場合（エンジン未対応・初回描画前）だけメインプレビューへフォールバックする。
    const snapshot = captionFreeSnapshotRef?.current;
    const source = snapshot?.hasFrame && snapshot.canvas
      ? snapshot.canvas
      : sourceCanvasRef.current;
    if (source && source.width > 0 && source.height > 0) {
      try {
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      } catch {
        // 転写できない場合（未描画等）は黒背景のままにする
      }
    }

    // 2) キャプション: export と同じ純関数で重ねる。
    //    preserveBackground で背景の塗り潰しを止め、転写した現在フレームを残す。
    //    設定確認が目的のため、キャプション表示 OFF 中でもミニプレビューには描く
    //    （enabled をここだけ true に差し替える）。
    if (captions.length > 0 || videoTitle) {
      drawCaptionLayerFrame(
        ctx,
        previewTimeSec,
        captions,
        settings.enabled ? settings : { ...settings, enabled: true },
        videoTitle,
        { matte: 'black', preserveBackground: true },
      );
    }
  }, [captions, settings, videoTitle, previewTimeSec, sourceCanvasRef, captionFreeSnapshotRef]);

  // 設定が変わるたびに 1 回だけ描き直す（rAF ループは回さない）。
  useEffect(() => {
    renderMiniFrame();
  }, [renderMiniFrame, refreshKey, width, height]);

  return (
    <div className="rounded-lg border border-gray-600/70 overflow-hidden bg-black">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="block w-full h-auto"
        aria-label="キャプションのミニプレビュー"
        role="img"
      />
      {caption && (
        <div className="bg-black/70 px-2 py-1 text-[9px] text-gray-300 text-center">
          {caption}
        </div>
      )}
    </div>
  );
};

export default React.memo(CaptionMiniPreview);
