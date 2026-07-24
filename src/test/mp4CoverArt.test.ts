/**
 * @file mp4CoverArt.test.ts
 * @description MP4 カバーアート埋め込みの回帰テスト
 */
import { describe, it, expect } from 'vitest';
import {
  iterateBoxes,
  injectMp4CoverArt,
  dataUrlToImageBytes,
  adjustChunkOffsetsInMoov,
  injectMp4CoverArtFromDataUrl,
} from '../utils/mp4CoverArt';

function writeFourCC(out: Uint8Array, offset: number, type: string): void {
  out[offset] = type.charCodeAt(0);
  out[offset + 1] = type.charCodeAt(1);
  out[offset + 2] = type.charCodeAt(2);
  out[offset + 3] = type.charCodeAt(3);
}

function createBox(type: string, content: Uint8Array): Uint8Array {
  const size = 8 + content.byteLength;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, size);
  writeFourCC(out, 4, type);
  out.set(content, 8);
  return out;
}

/** 最小の ftyp + moov(mvhd + stco) + mdat を合成 */
function buildMinimalMp4(): ArrayBuffer {
  // stco: FullBox(4) + entry_count=1 + offset
  const stcoBody = new Uint8Array(4 + 4 + 4);
  const stcoView = new DataView(stcoBody.buffer);
  stcoView.setUint32(0, 0); // version/flags
  stcoView.setUint32(4, 1); // entry_count
  // offset は後で mdat 開始位置に合わせる — 仮に 0 を入れて inject 後に検証
  stcoView.setUint32(8, 0);

  const stbl = createBox('stbl', createBox('stco', stcoBody));
  const minf = createBox('minf', stbl);
  const mdia = createBox('mdia', minf);
  const trak = createBox('trak', mdia);
  const mvhd = createBox('mvhd', new Uint8Array(100));
  const moov = createBox('moov', (() => {
    const c = new Uint8Array(mvhd.byteLength + trak.byteLength);
    c.set(mvhd, 0);
    c.set(trak, mvhd.byteLength);
    return c;
  })());

  const ftyp = createBox('ftyp', new Uint8Array([
    // isom
    0x69, 0x73, 0x6f, 0x6d,
    0, 0, 0, 1,
    0x69, 0x73, 0x6f, 0x6d,
  ]));
  const mdat = createBox('mdat', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));

  // stco に正しい mdat データ開始オフセットを書く
  const beforeMdat = ftyp.byteLength + moov.byteLength;
  const mdatDataOffset = beforeMdat + 8; // mdat header
  // moov 内 stco を探すのは面倒なので、合成後に patch
  const total = new Uint8Array(ftyp.byteLength + moov.byteLength + mdat.byteLength);
  total.set(ftyp, 0);
  total.set(moov, ftyp.byteLength);
  total.set(mdat, ftyp.byteLength + moov.byteLength);

  // stco offset を patch（moov 内を走査）
  const moovStart = ftyp.byteLength;
  const moovBox = iterateBoxes(total, moovStart, moovStart + moov.byteLength)[0];
  const walk = (s: number, e: number) => {
    for (const b of iterateBoxes(total, s, e)) {
      if (b.type === 'stco') {
        const view = new DataView(total.buffer);
        view.setUint32(b.contentStart + 8, mdatDataOffset);
      } else {
        walk(b.contentStart, b.end);
      }
    }
  };
  walk(moovBox.contentStart, moovBox.end);

  return total.buffer;
}

/** 最小 JPEG ヘッダ風バイト（埋め込みサイズ用） */
function fakeJpeg(byteLength = 200): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[byteLength - 2] = 0xff;
  bytes[byteLength - 1] = 0xd9;
  for (let i = 2; i < byteLength - 2; i++) bytes[i] = i & 0xff;
  return bytes;
}

describe('mp4CoverArt', () => {
  it('iterateBoxes parses top-level ftyp/moov/mdat', () => {
    const buf = buildMinimalMp4();
    const boxes = iterateBoxes(new Uint8Array(buf), 0, buf.byteLength);
    expect(boxes.map((b) => b.type)).toEqual(['ftyp', 'moov', 'mdat']);
  });

  it('injectMp4CoverArt adds covr under moov/udta/meta/ilst', () => {
    const original = buildMinimalMp4();
    const jpeg = fakeJpeg(256);
    const next = injectMp4CoverArt(original, jpeg);
    expect(next.byteLength).toBeGreaterThan(original.byteLength);

    const bytes = new Uint8Array(next);
    const top = iterateBoxes(bytes, 0, bytes.byteLength);
    const moov = top.find((b) => b.type === 'moov');
    expect(moov).toBeTruthy();

    const moovChildren = iterateBoxes(bytes, moov!.contentStart, moov!.end);
    const udta = moovChildren.find((b) => b.type === 'udta');
    expect(udta).toBeTruthy();

    // covr 四CC がファイル内に存在
    const asText = Array.from(bytes).map((c) => String.fromCharCode(c)).join('');
    expect(asText.includes('covr')).toBe(true);
    expect(asText.includes('ilst')).toBe(true);
  });

  it('adjustChunkOffsetsInMoov shifts stco entries', () => {
    // stco body: version/flags + count + one offset
    const stcoBody = new Uint8Array(12);
    const v = new DataView(stcoBody.buffer);
    v.setUint32(0, 0);
    v.setUint32(4, 1);
    v.setUint32(8, 1000);
    const stco = createBox('stco', stcoBody);
    const moovPayload = stco; // 簡略: moov 中身 = stco のみ
    const copy = new Uint8Array(moovPayload);
    adjustChunkOffsetsInMoov(copy, 50);
    const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
    // stco contentStart = 8, then version(4)+count(4)+entry at 16
    expect(view.getUint32(8 + 8)).toBe(1050);
  });

  it('dataUrlToImageBytes parses jpeg data URL', () => {
    // "hi" base64
    const dataUrl = 'data:image/jpeg;base64,aGk=';
    const parsed = dataUrlToImageBytes(dataUrl);
    expect(parsed).not.toBeNull();
    expect(parsed!.isJpeg).toBe(true);
    expect(Array.from(parsed!.bytes)).toEqual([104, 105]); // 'h','i'
  });

  it('injectMp4CoverArtFromDataUrl no-ops on invalid input', () => {
    const original = buildMinimalMp4();
    const { buffer, injected } = injectMp4CoverArtFromDataUrl(original, null);
    expect(injected).toBe(false);
    expect(buffer.byteLength).toBe(original.byteLength);
  });
});
