/**
 * @file useFileDropZone.ts
 * @description セクションをファイルのドロップ先にするフックと、
 * ドロップ先以外へ落としたときにブラウザがファイルを開いて編集画面から離脱するのを防ぐフック。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { hasDraggedFiles, partitionFilesByAccept } from '../utils/fileDrop';

export interface UseFileDropZoneOptions {
  /** `<input accept>` と同じ書式。追加ボタンと同じ値を渡す */
  accept: string;
  /** false なら受け付けた先頭 1 件だけ渡す（追加ボタンが単一選択のとき） */
  multiple?: boolean;
  /** ロック中など。ドロップを受け付けず、オーバーレイで理由を見せる */
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  /** 受け付けないファイルが混ざっていたとき（受け付けた件数も渡す） */
  onRejected?: (rejectedCount: number, acceptedCount: number) => void;
}

export interface FileDropZoneProps {
  onDragEnter: (e: React.DragEvent<HTMLElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLElement>) => void;
  onDrop: (e: React.DragEvent<HTMLElement>) => void;
}

export function useFileDropZone({
  accept,
  multiple = true,
  disabled = false,
  onFiles,
  onRejected,
}: UseFileDropZoneOptions): { isDragActive: boolean; dropZoneProps: FileDropZoneProps } {
  const [isDragActive, setIsDragActive] = useState(false);
  // 子要素を出入りするたびに dragenter/dragleave が対で飛ぶため、深さで数える
  const depthRef = useRef(0);

  const reset = useCallback(() => {
    depthRef.current = 0;
    setIsDragActive(false);
  }, []);

  // ドラッグ中にウィンドウ外で離された / 別の場所に落とされたときに表示が残らないようにする
  useEffect(() => {
    if (!isDragActive) return;
    window.addEventListener('drop', reset);
    window.addEventListener('dragend', reset);
    return () => {
      window.removeEventListener('drop', reset);
      window.removeEventListener('dragend', reset);
    };
  }, [isDragActive, reset]);

  const onDragEnter = useCallback((e: React.DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(e.dataTransfer)) return;
    e.preventDefault();
    depthRef.current += 1;
    setIsDragActive(true);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(e.dataTransfer)) return;
    // preventDefault しないと drop が発火しない
    e.preventDefault();
    e.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
  }, [disabled]);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(e.dataTransfer)) return;
    depthRef.current = Math.max(0, depthRef.current - 1);
    if (depthRef.current === 0) setIsDragActive(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(e.dataTransfer)) return;
    e.preventDefault();
    reset();
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length === 0) return;
    const { accepted, rejected } = partitionFilesByAccept(files, accept);
    if (rejected.length > 0) onRejected?.(rejected.length, accepted.length);
    if (accepted.length === 0) return;
    onFiles(multiple ? accepted : accepted.slice(0, 1));
  }, [accept, disabled, multiple, onFiles, onRejected, reset]);

  return {
    isDragActive,
    dropZoneProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}

/**
 * ドロップ先以外にファイルを落とすと、ブラウザはそのファイルを開いて画面遷移してしまう
 * （編集中の画面から離脱する）。ウィンドウ全体で既定動作を止め、「ここには置けない」表示にする。
 * セクションのドロップ先は自分で preventDefault 済みなので、そちらの表示は上書きしない。
 */
export function usePreventWindowFileDrop(): void {
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      if (!hasDraggedFiles(e.dataTransfer)) return;
      if (e.defaultPrevented) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    };
    const handleDrop = (e: DragEvent) => {
      if (!hasDraggedFiles(e.dataTransfer)) return;
      e.preventDefault();
    };
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);
}
