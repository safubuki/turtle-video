/**
 * @file fileDrop.ts
 * @description セクションへファイルをドラッグ&ドロップしたときの受付判定（純ロジック）。
 * `<input accept>` と同じ書式（MIME / `type/*` / `.拡張子`）で判定し、
 * 「追加」ボタンで選べるファイルとドロップで受け付けるファイルを一致させる。
 */

/**
 * OS やブラウザによって `File.type` が空になる拡張子の補完表。
 * （Windows の .opus / .flac / .mkv などは空になりやすい）
 * ファイル選択ダイアログでは拡張子で絞られるが、ドロップは type しか見えないため補う。
 */
const EXTENSION_MIME_FALLBACK: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  weba: 'audio/webm',
  caf: 'audio/x-caf',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
};

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

/** `File.type` が空なら拡張子から推定した MIME を返す */
export function resolveDroppedFileMimeType(file: Pick<File, 'name' | 'type'>): string {
  const type = (file.type || '').toLowerCase();
  if (type) return type;
  return EXTENSION_MIME_FALLBACK[getFileExtension(file.name)] ?? '';
}

/**
 * `<input accept>` 書式の文字列にファイルが合うかを判定する。
 * accept が空なら何でも受け付ける（input と同じ）。
 */
export function matchesFileAccept(file: Pick<File, 'name' | 'type'>, accept: string): boolean {
  const patterns = accept
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (patterns.length === 0) return true;

  const mime = resolveDroppedFileMimeType(file);
  const ext = getFileExtension(file.name);

  return patterns.some((pattern) => {
    if (pattern.startsWith('.')) return ext !== '' && pattern.slice(1) === ext;
    if (!mime) return false;
    if (pattern.endsWith('/*')) return mime.startsWith(pattern.slice(0, -1));
    return mime === pattern;
  });
}

/** ドロップされたファイルを、受け付けるものとそれ以外に分ける */
export function partitionFilesByAccept<T extends Pick<File, 'name' | 'type'>>(
  files: readonly T[],
  accept: string,
): { accepted: T[]; rejected: T[] } {
  const accepted: T[] = [];
  const rejected: T[] = [];
  files.forEach((file) => {
    (matchesFileAccept(file, accept) ? accepted : rejected).push(file);
  });
  return { accepted, rejected };
}

/** ドラッグ中のデータに OS からのファイルが含まれるか（ページ内のテキスト・要素ドラッグは除外） */
export function hasDraggedFiles(dataTransfer: Pick<DataTransfer, 'types'> | null | undefined): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types ?? []).includes('Files');
}
