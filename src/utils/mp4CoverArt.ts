/**
 * @file mp4CoverArt.ts
 * @description MP4 コンテナへカバーアート（iTunes 互換 covr）を埋め込む純ロジック。
 *
 * ## 動画サムネイルの一般的な仕組み
 * 1. **コンテナメタデータ（cover art）**: `moov/udta/meta/ilst/covr` に JPEG/PNG を格納。
 *    多くのメディアプレイヤー・一部 OS/ビューアが「動画のサムネイル画像」として利用する。
 *    FFmpeg の `-disposition:v:0 attached_pic` / 各種 TagEditor と同系統。
 * 2. **映像トラックの先頭キーフレーム**: Windows エクスプローラー等のシェルは、
 *    カバーアートではなく **動画ストリームからフレームを抽出**することが多い。
 *    先頭が黒だと別フレームを探すため、先頭 IDR を意図した画像にすると効く場合がある。
 *
 * 本モジュールは (1) を担当する。エクスポート側で (2) と併用する。
 */

const BOX_HEADER = 8;
const JPEG_TYPE_CODE = 13; // iTunes well-known type: JPEG

function writeFourCC(out: Uint8Array, offset: number, type: string): void {
  out[offset] = type.charCodeAt(0);
  out[offset + 1] = type.charCodeAt(1);
  out[offset + 2] = type.charCodeAt(2);
  out[offset + 3] = type.charCodeAt(3);
}

function readFourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

export interface Mp4Box {
  type: string;
  /** ボックス全体の開始オフセット（size フィールド） */
  start: number;
  /** ヘッダ直後（コンテンツ開始） */
  contentStart: number;
  /** ボックス終端（排他） */
  end: number;
  /** size フィールド値（通常ヘッダ含む全体長） */
  size: number;
}

/** 連続領域内の子ボックスを列挙する（large size / 64-bit は簡易対応） */
export function iterateBoxes(
  bytes: Uint8Array,
  start: number,
  end: number,
): Mp4Box[] {
  const boxes: Mp4Box[] = [];
  let offset = start;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  while (offset + BOX_HEADER <= end) {
    let size = view.getUint32(offset);
    const type = readFourCC(bytes, offset + 4);
    let headerSize = BOX_HEADER;
    if (size === 1) {
      if (offset + 16 > end) break;
      // 64-bit size — JS では Number に収まる範囲のみ扱う
      const high = view.getUint32(offset + 8);
      const low = view.getUint32(offset + 12);
      size = high * 2 ** 32 + low;
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > end) break;
    boxes.push({
      type,
      start: offset,
      contentStart: offset + headerSize,
      end: offset + size,
      size,
    });
    offset += size;
  }
  return boxes;
}

function createBox(type: string, content: Uint8Array): Uint8Array {
  const size = BOX_HEADER + content.byteLength;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, size);
  writeFourCC(out, 4, type);
  out.set(content, BOX_HEADER);
  return out;
}

function createFullBox(type: string, version: number, flags: number, content: Uint8Array): Uint8Array {
  const body = new Uint8Array(4 + content.byteLength);
  body[0] = version & 0xff;
  body[1] = (flags >> 16) & 0xff;
  body[2] = (flags >> 8) & 0xff;
  body[3] = flags & 0xff;
  body.set(content, 4);
  return createBox(type, body);
}

/** iTunes `data` 原子（JPEG cover） */
function createCoverDataAtom(jpegBytes: Uint8Array): Uint8Array {
  // content: type(4)=13, locale(4)=0, image
  const content = new Uint8Array(8 + jpegBytes.byteLength);
  const view = new DataView(content.buffer);
  view.setUint32(0, JPEG_TYPE_CODE);
  view.setUint32(4, 0);
  content.set(jpegBytes, 8);
  return createBox('data', content);
}

function createHdlrMdir(): Uint8Array {
  // hdlr FullBox body: pre_defined(4) + handler_type(4)='mdir' + reserved(12) + name(1)=0
  const b = new Uint8Array(4 + 4 + 12 + 1);
  const bv = new DataView(b.buffer);
  bv.setUint32(0, 0); // pre_defined
  b[4] = 'm'.charCodeAt(0);
  b[5] = 'd'.charCodeAt(0);
  b[6] = 'i'.charCodeAt(0);
  b[7] = 'r'.charCodeAt(0);
  // reserved 12 zeros already
  b[20] = 0; // empty name
  return createFullBox('hdlr', 0, 0, b);
}

function createCoverArtMetaBoxes(jpegBytes: Uint8Array): Uint8Array {
  const dataAtom = createCoverDataAtom(jpegBytes);
  const covr = createBox('covr', dataAtom);
  const ilst = createBox('ilst', covr);
  const hdlr = createHdlrMdir();
  const metaContent = new Uint8Array(hdlr.byteLength + ilst.byteLength);
  metaContent.set(hdlr, 0);
  metaContent.set(ilst, hdlr.byteLength);
  // meta is FullBox
  return createFullBox('meta', 0, 0, metaContent);
}

/**
 * moov 内の stco / co64 のチャンクオフセットを delta だけずらす（in-place）。
 * moov が mdat より前にありサイズが変わったときに必須。
 */
export function adjustChunkOffsetsInMoov(moovBytes: Uint8Array, delta: number): void {
  if (delta === 0) return;
  const view = new DataView(moovBytes.buffer, moovBytes.byteOffset, moovBytes.byteLength);

  const walk = (start: number, end: number) => {
    for (const box of iterateBoxes(moovBytes, start, end)) {
      if (box.type === 'stco') {
        // FullBox(4) + entry_count(4) + entries(4 each)
        const entryCount = view.getUint32(box.contentStart + 4);
        let p = box.contentStart + 8;
        for (let i = 0; i < entryCount; i++) {
          if (p + 4 > box.end) break;
          const v = view.getUint32(p);
          view.setUint32(p, (v + delta) >>> 0);
          p += 4;
        }
      } else if (box.type === 'co64') {
        const entryCount = view.getUint32(box.contentStart + 4);
        let p = box.contentStart + 8;
        for (let i = 0; i < entryCount; i++) {
          if (p + 8 > box.end) break;
          const high = view.getUint32(p);
          const low = view.getUint32(p + 4);
          let value = high * 2 ** 32 + low + delta;
          if (value < 0) value = 0;
          view.setUint32(p, Math.floor(value / 2 ** 32) >>> 0);
          view.setUint32(p + 4, value >>> 0);
          p += 8;
        }
      } else {
        // コンテナを再帰
        walk(box.contentStart, box.end);
      }
    }
  };

  walk(0, moovBytes.byteLength);
}

/**
 * 既存 udta があれば中身を保ちつつ cover 用 meta を追加/置換。
 * なければ新規 udta を返す。
 */
function mergeOrCreateUdta(existingUdtaContent: Uint8Array | null, jpegBytes: Uint8Array): Uint8Array {
  const coverMeta = createCoverArtMetaBoxes(jpegBytes);
  if (!existingUdtaContent || existingUdtaContent.byteLength === 0) {
    return createBox('udta', coverMeta);
  }

  // 既存の meta（カバー含む）を除いた子を維持し、新しい meta を末尾に追加
  const children = iterateBoxes(existingUdtaContent, 0, existingUdtaContent.byteLength);
  const kept: Uint8Array[] = [];
  for (const child of children) {
    if (child.type === 'meta') continue; // カバー用 meta を置き換え
    kept.push(existingUdtaContent.subarray(child.start, child.end));
  }
  kept.push(coverMeta);

  let total = 0;
  for (const k of kept) total += k.byteLength;
  const content = new Uint8Array(total);
  let o = 0;
  for (const k of kept) {
    content.set(k, o);
    o += k.byteLength;
  }
  return createBox('udta', content);
}

/**
 * data URL (image/jpeg または image/png) を生バイトへ。
 * PNG の場合もそのまま返す（type code は呼び出し側で JPEG 推奨）。
 */
export function dataUrlToImageBytes(dataUrl: string): { bytes: Uint8Array; isJpeg: boolean } | null {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = /^data:(image\/(?:jpeg|jpg|png));base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const b64 = match[2];
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, isJpeg: mime.includes('jpeg') || mime.includes('jpg') };
  } catch {
    return null;
  }
}

/**
 * 完成済み MP4（ftyp+moov+mdat 想定）に JPEG カバーアートを埋め込む。
 * moov サイズ変化に応じて stco/co64 を補正する。
 *
 * @returns 埋め込み後バッファ。失敗時は元バッファをそのまま返す
 */
export function injectMp4CoverArt(
  mp4Buffer: ArrayBuffer,
  jpegBytes: Uint8Array,
): ArrayBuffer {
  if (!mp4Buffer || mp4Buffer.byteLength < 16) return mp4Buffer;
  if (!jpegBytes || jpegBytes.byteLength < 2) return mp4Buffer;

  const src = new Uint8Array(mp4Buffer);
  const top = iterateBoxes(src, 0, src.byteLength);
  const moov = top.find((b) => b.type === 'moov');
  if (!moov) return mp4Buffer;

  const moovContent = src.subarray(moov.contentStart, moov.end);
  const moovChildren = iterateBoxes(moovContent, 0, moovContent.byteLength);

  const parts: Uint8Array[] = [];
  let existingUdta: Uint8Array | null = null;
  for (const child of moovChildren) {
    if (child.type === 'udta') {
      existingUdta = moovContent.subarray(child.contentStart, child.end);
      continue;
    }
    parts.push(moovContent.subarray(child.start, child.end));
  }

  const newUdta = mergeOrCreateUdta(existingUdta, jpegBytes);
  parts.push(newUdta);

  let newMoovContentLen = 0;
  for (const p of parts) newMoovContentLen += p.byteLength;
  const newMoovContent = new Uint8Array(newMoovContentLen);
  {
    let o = 0;
    for (const p of parts) {
      newMoovContent.set(p, o);
      o += p.byteLength;
    }
  }

  const newMoov = createBox('moov', newMoovContent);
  const delta = newMoov.byteLength - moov.size;

  // moov が mdat より前ならチャンクオフセット補正
  const mdat = top.find((b) => b.type === 'mdat');
  if (mdat && moov.start < mdat.start && delta !== 0) {
    // newMoov の中身（ヘッダ除く）に対して offset 調整
    const moovPayload = newMoov.subarray(BOX_HEADER);
    adjustChunkOffsetsInMoov(moovPayload, delta);
  }

  // ファイル再構築
  let total = 0;
  const rebuilt: Uint8Array[] = [];
  for (const box of top) {
    if (box.type === 'moov') {
      rebuilt.push(newMoov);
      total += newMoov.byteLength;
    } else {
      const slice = src.subarray(box.start, box.end);
      rebuilt.push(slice);
      total += slice.byteLength;
    }
  }

  const out = new Uint8Array(total);
  let o = 0;
  for (const part of rebuilt) {
    out.set(part, o);
    o += part.byteLength;
  }
  return out.buffer;
}

/**
 * data URL から MP4 へカバーアートを埋め込むワンショット API。
 * JPEG 以外は埋め込みをスキップ（type code を JPEG 固定にしているため）。
 */
export function injectMp4CoverArtFromDataUrl(
  mp4Buffer: ArrayBuffer,
  dataUrl: string | null | undefined,
): { buffer: ArrayBuffer; injected: boolean } {
  if (!dataUrl) return { buffer: mp4Buffer, injected: false };
  const parsed = dataUrlToImageBytes(dataUrl);
  if (!parsed || !parsed.isJpeg || parsed.bytes.byteLength < 100) {
    return { buffer: mp4Buffer, injected: false };
  }
  try {
    const next = injectMp4CoverArt(mp4Buffer, parsed.bytes);
    // サイズが増えていれば注入成功とみなす
    const injected = next.byteLength > mp4Buffer.byteLength;
    return { buffer: next, injected };
  } catch {
    return { buffer: mp4Buffer, injected: false };
  }
}

/**
 * data URL から ImageBitmap を生成（先頭キーフレーム差し替え用）。
 */
export async function loadCoverArtImageBitmap(
  dataUrl: string | null | undefined,
): Promise<ImageBitmap | null> {
  if (!dataUrl) return null;
  try {
    const parsed = dataUrlToImageBytes(dataUrl);
    if (!parsed || parsed.bytes.byteLength < 32) return null;
    const mime = parsed.isJpeg ? 'image/jpeg' : 'image/png';
    // BlobPart 互換のため ArrayBuffer へコピー
    const ab = parsed.bytes.buffer.slice(
      parsed.bytes.byteOffset,
      parsed.bytes.byteOffset + parsed.bytes.byteLength,
    );
    const blob = new Blob([ab as ArrayBuffer], { type: mime });
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

/**
 * 先頭フレーム用: ポスター画像をエクスポート解像度のキャンバスに cover 配置して VideoFrame を作る。
 * poster が無い、または frameIndex !== 0 のときは通常の canvas から生成。
 */
export function createExportVideoFrame(params: {
  canvas: HTMLCanvasElement;
  posterBitmap: ImageBitmap | null;
  frameIndex: number;
  timestampUs: number;
  durationUs: number;
  /** 指定時は live Canvas ではなく、描画スロット確定時のスナップショットを使う */
  source?: CanvasImageSource | null;
}): VideoFrame {
  const { canvas, posterBitmap, frameIndex, timestampUs, durationUs, source } = params;
  const frameInit: VideoFrameInit = {
    timestamp: timestampUs,
    duration: durationUs,
    alpha: 'discard',
  };
  if (frameIndex === 0 && posterBitmap && canvas.width > 0 && canvas.height > 0) {
    const off = document.createElement('canvas');
    off.width = canvas.width;
    off.height = canvas.height;
    const ctx = off.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, off.width, off.height);
      const scale = Math.max(off.width / posterBitmap.width, off.height / posterBitmap.height);
      const w = posterBitmap.width * scale;
      const h = posterBitmap.height * scale;
      ctx.drawImage(posterBitmap, (off.width - w) / 2, (off.height - h) / 2, w, h);
      return new VideoFrame(off, frameInit);
    }
  }
  return new VideoFrame(source ?? canvas, frameInit);
}
