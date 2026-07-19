import { describe, expect, it } from 'vitest';
import { inspectMp4Durations } from '../utils/mp4Duration';

function createBox(type: string, payload: Uint8Array): Uint8Array {
  const buffer = new Uint8Array(8 + payload.length);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, buffer.length);
  for (let i = 0; i < 4; i++) {
    buffer[4 + i] = type.charCodeAt(i);
  }
  buffer.set(payload, 8);
  return buffer;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    buffer.set(part, offset);
    offset += part.length;
  }
  return buffer;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function createMvhd(timescale: number, duration: number): Uint8Array {
  const payload = new Uint8Array(4 + 4 + 4 + 4 + 4);
  const view = new DataView(payload.buffer);
  view.setUint8(0, 0);
  view.setUint32(12, timescale);
  view.setUint32(16, duration);
  return createBox('mvhd', payload);
}

function createMvhdV1(timescale: number, duration: number): Uint8Array {
  const payload = new Uint8Array(4 + 8 + 8 + 4 + 8);
  const view = new DataView(payload.buffer);
  view.setUint8(0, 1);
  view.setUint32(20, timescale);
  view.setUint32(28, duration);
  return createBox('mvhd', payload);
}

function createMdhd(timescale: number, duration: number): Uint8Array {
  const payload = new Uint8Array(4 + 4 + 4 + 4 + 4);
  const view = new DataView(payload.buffer);
  view.setUint8(0, 0);
  view.setUint32(12, timescale);
  view.setUint32(16, duration);
  return createBox('mdhd', payload);
}

function createMdhdV1(timescale: number, duration: number): Uint8Array {
  const payload = new Uint8Array(4 + 8 + 8 + 4 + 8);
  const view = new DataView(payload.buffer);
  view.setUint8(0, 1);
  view.setUint32(20, timescale);
  view.setUint32(28, duration);
  return createBox('mdhd', payload);
}

function createHdlr(handlerType: string): Uint8Array {
  const payload = new Uint8Array(4 + 4 + 4);
  for (let i = 0; i < 4; i++) {
    payload[8 + i] = handlerType.charCodeAt(i);
  }
  return createBox('hdlr', payload);
}

function createTkhd(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(84);
  const view = new DataView(payload.buffer);
  view.setUint8(0, 0);
  view.setUint32(76, width * 0x1_0000);
  view.setUint32(80, height * 0x1_0000);
  return createBox('tkhd', payload);
}

function createTkhdV1(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(96);
  const view = new DataView(payload.buffer);
  view.setUint8(0, 1);
  view.setUint32(88, width * 0x1_0000);
  view.setUint32(92, height * 0x1_0000);
  return createBox('tkhd', payload);
}

function createTrack(
  handlerType: string,
  timescale: number,
  duration: number,
  dimensions?: { width: number; height: number },
): Uint8Array {
  return createBox(
    'trak',
    concatBytes(
      ...(dimensions ? [createTkhd(dimensions.width, dimensions.height)] : []),
      createBox('mdia', concatBytes(createMdhd(timescale, duration), createHdlr(handlerType))),
    ),
  );
}

function createTrackV1(
  handlerType: string,
  timescale: number,
  duration: number,
  dimensions?: { width: number; height: number },
): Uint8Array {
  return createBox(
    'trak',
    concatBytes(
      ...(dimensions ? [createTkhdV1(dimensions.width, dimensions.height)] : []),
      createBox('mdia', concatBytes(createMdhdV1(timescale, duration), createHdlr(handlerType))),
    ),
  );
}

describe('inspectMp4Durations', () => {
  it('container / video / audio の duration を MP4 から読み取れる', () => {
    const bytes = concatBytes(
      createBox('ftyp', new Uint8Array(4)),
      createBox(
        'moov',
        concatBytes(
          createMvhd(1000, 10010),
          createTrack('vide', 30000, 300300, { width: 1920, height: 1080 }),
          createTrack('soun', 48000, 480480),
        ),
      ),
    );
    const buffer = toArrayBuffer(bytes);

    expect(inspectMp4Durations(buffer)).toEqual({
      containerDurationUs: 10_010_000,
      videoDurationUs: 10_010_000,
      audioDurationUs: 10_010_000,
      videoWidth: 1920,
      videoHeight: 1080,
    });
  });

  it('version 1 の mvhd / mdhd も読める', () => {
    const bytes = concatBytes(
      createBox('ftyp', new Uint8Array(4)),
      createBox(
        'moov',
        concatBytes(
          createMvhdV1(1000, 10010),
          createTrackV1('vide', 30000, 300300, { width: 1280, height: 720 }),
          createTrackV1('soun', 48000, 480480),
        ),
      ),
    );
    const buffer = toArrayBuffer(bytes);

    expect(inspectMp4Durations(buffer)).toEqual({
      containerDurationUs: 10_010_000,
      videoDurationUs: 10_010_000,
      audioDurationUs: 10_010_000,
      videoWidth: 1280,
      videoHeight: 720,
    });
  });

  it('複数 video track がある場合は最長 track の解像度を採用する', () => {
    const bytes = concatBytes(
      createBox(
        'moov',
        concatBytes(
          createMvhd(1000, 10000),
          createTrack('vide', 1000, 1000, { width: 320, height: 180 }),
          createTrack('vide', 1000, 10000, { width: 1920, height: 1080 }),
        ),
      ),
    );

    expect(inspectMp4Durations(toArrayBuffer(bytes))).toEqual({
      containerDurationUs: 10_000_000,
      videoDurationUs: 10_000_000,
      audioDurationUs: null,
      videoWidth: 1920,
      videoHeight: 1080,
    });
  });

  it('timescale が 0 の track は null 扱いにする', () => {
    const bytes = concatBytes(
      createBox('ftyp', new Uint8Array(4)),
      createBox('moov', concatBytes(createMvhd(1000, 10010), createTrack('vide', 0, 300300))),
    );
    const buffer = toArrayBuffer(bytes);

    expect(inspectMp4Durations(buffer)).toEqual({
      containerDurationUs: 10_010_000,
      videoDurationUs: null,
      audioDurationUs: null,
      videoWidth: null,
      videoHeight: null,
    });
  });

  it('track が無い MP4 は container duration だけ返す', () => {
    const bytes = concatBytes(
      createBox('ftyp', new Uint8Array(4)),
      createBox('moov', createMvhd(1000, 5000)),
    );
    const buffer = toArrayBuffer(bytes);

    expect(inspectMp4Durations(buffer)).toEqual({
      containerDurationUs: 5_000_000,
      videoDurationUs: null,
      audioDurationUs: null,
      videoWidth: null,
      videoHeight: null,
    });
  });

  it('duration 情報が無い不正構造では null を返す', () => {
    const invalid = createBox('moov', createBox('trak', new Uint8Array(4)));
    const buffer = toArrayBuffer(invalid);

    expect(inspectMp4Durations(buffer)).toBeNull();
  });
});
