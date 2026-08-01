import { describe, expect, it } from 'vitest';
import type { Caption } from '../types';
import {
  buildSubtitleCuesFromCaptions,
  buildSubtitleFileContent,
  formatSubtitleTimestamp,
  normalizeSubtitleCueText,
  serializeSubtitleCuesAsSrt,
  serializeSubtitleCuesAsVtt,
} from '../utils/captionSubtitle';

function makeCaption(partial: Partial<Caption> & Pick<Caption, 'id' | 'text' | 'startTime' | 'endTime'>): Caption {
  return {
    fadeIn: false,
    fadeOut: false,
    fadeInDuration: 0.5,
    fadeOutDuration: 0.5,
    ...partial,
  };
}

describe('formatSubtitleTimestamp', () => {
  it('formats SRT with comma milliseconds', () => {
    expect(formatSubtitleTimestamp(0, 'srt')).toBe('00:00:00,000');
    expect(formatSubtitleTimestamp(65.5, 'srt')).toBe('00:01:05,500');
    expect(formatSubtitleTimestamp(3661.234, 'srt')).toBe('01:01:01,234');
  });

  it('formats VTT with dot milliseconds', () => {
    expect(formatSubtitleTimestamp(1.001, 'vtt')).toBe('00:00:01.001');
  });
});

describe('buildSubtitleCuesFromCaptions', () => {
  it('builds one cue per single-line caption', () => {
    const cues = buildSubtitleCuesFromCaptions([
      makeCaption({ id: 'a', text: 'Hello', startTime: 1, endTime: 3 }),
      makeCaption({ id: 'b', text: 'World', startTime: 0, endTime: 0.5 }),
    ]);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ index: 1, text: 'World', startTime: 0, endTime: 0.5 });
    expect(cues[1]).toMatchObject({ index: 2, text: 'Hello', startTime: 1, endTime: 3 });
  });

  it('expands sequential multi-line captions into separate cues', () => {
    const cues = buildSubtitleCuesFromCaptions([
      makeCaption({
        id: 'seq',
        text: 'あいう\nえお',
        startTime: 0,
        endTime: 10,
        sequentialGapSec: 0,
      }),
    ]);
    expect(cues.length).toBe(2);
    expect(cues[0].text).toBe('あいう');
    expect(cues[1].text).toBe('えお');
    expect(cues[0].startTime).toBe(0);
    expect(cues[0].endTime).toBeGreaterThan(0);
    expect(cues[1].endTime).toBe(10);
    // 文字数比: 3:2
    expect(cues[0].endTime).toBeCloseTo(6, 5);
    expect(cues[1].startTime).toBeCloseTo(6, 5);
  });

  it('skips empty text', () => {
    const cues = buildSubtitleCuesFromCaptions([
      makeCaption({ id: 'empty', text: '  \n  ', startTime: 0, endTime: 1 }),
    ]);
    expect(cues).toHaveLength(0);
  });
});

describe('serialize subtitle formats', () => {
  // 単一行は 1 キュー。複数行は時分割で複数キューになる（buildSubtitleCuesFromCaptions）。
  const cues = buildSubtitleCuesFromCaptions([
    makeCaption({ id: 'a', text: 'Hello World', startTime: 0, endTime: 1 }),
  ]);

  it('serializes SRT', () => {
    const srt = serializeSubtitleCuesAsSrt(cues);
    expect(srt).toContain('1\n');
    expect(srt).toContain('00:00:00,000 --> 00:00:01,000');
    expect(srt).toContain('Hello World');
  });

  it('serializes VTT with header', () => {
    const vtt = serializeSubtitleCuesAsVtt(cues);
    expect(vtt.startsWith('WEBVTT\n')).toBe(true);
    expect(vtt).toContain('00:00:00.000 --> 00:00:01.000');
  });

  it('buildSubtitleFileContent switches format', () => {
    const captions = [makeCaption({ id: 'a', text: 'Hi', startTime: 0, endTime: 1 })];
    expect(buildSubtitleFileContent(captions, 'srt')).toContain('00:00:00,000');
    expect(buildSubtitleFileContent(captions, 'vtt')).toContain('WEBVTT');
  });
});

describe('normalizeSubtitleCueText', () => {
  it('trims trailing spaces and normalizes newlines', () => {
    expect(normalizeSubtitleCueText('a  \r\nb  ')).toBe('a\nb');
  });
});
