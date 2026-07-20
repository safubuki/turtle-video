/**
 * captionBulkInput（一括キャプション割付）のテスト
 */

import { describe, expect, it } from 'vitest';
import {
  BULK_CAPTION_FIXED_DURATION_SEC,
  assignBulkCaptionIds,
  collapseBlankLineBlocks,
  convertBulkCaptionTextMode,
  formatCaptionsAsBulkText,
  normalizeBulkCaptionText,
  parseBulkCaptionInput,
  parseTimeNotation,
  planBulkCaptions,
  splitCaptionLines,
  stripBulkCaptionTimeNotations,
} from '../utils/captionBulkInput';

describe('splitCaptionLines', () => {
  it('splits lines, trims whitespace, and drops empty lines', () => {
    expect(splitCaptionLines('a\r\n  b  \n\n\nc\n')).toEqual(['a', 'b', 'c']);
    expect(splitCaptionLines('   \n\n')).toEqual([]);
  });
});

describe('planBulkCaptions', () => {
  it('distributes evenly from startTime to the end of the video', () => {
    const plans = planBulkCaptions(['1', '2', '3', '4'], 'even', {
      startTime: 10,
      totalDuration: 30,
    });
    expect(plans).toHaveLength(4);
    expect(plans[0]).toMatchObject({ startTime: 10, endTime: 15 });
    expect(plans[1]).toMatchObject({ startTime: 15, endTime: 20 });
    // 最終行の終了は必ず動画末尾
    expect(plans[3].endTime).toBe(30);
    // 連続配置（隙間なし）
    for (let i = 1; i < plans.length; i += 1) {
      expect(plans[i].startTime).toBeCloseTo(plans[i - 1].endTime);
    }
  });

  it('places fixed-duration captions sequentially and clips at the video end', () => {
    const plans = planBulkCaptions(['a', 'b', 'c'], 'fixed', {
      startTime: 0,
      totalDuration: 7,
    });
    expect(plans[0]).toMatchObject({ startTime: 0, endTime: BULK_CAPTION_FIXED_DURATION_SEC });
    expect(plans[1]).toMatchObject({ startTime: 3, endTime: 6 });
    // 3 行目は残り 1 秒に押し込まれる
    expect(plans[2].startTime).toBe(6);
    expect(plans[2].endTime).toBe(7);
  });

  it('drops lines that no longer fit within the video', () => {
    const plans = planBulkCaptions(['a', 'b', 'c', 'd'], 'fixed', {
      startTime: 0,
      totalDuration: 6.2,
    });
    // 0-3, 3-6, 6-6.2(<0.2 で打ち切り) → 2〜3件
    expect(plans.length).toBeLessThan(4);
    expect(plans[plans.length - 1].endTime).toBeLessThanOrEqual(6.2);
  });

  it('falls back to fixed mode when the remaining time is too short for even split', () => {
    const plans = planBulkCaptions(['a', 'b', 'c'], 'even', {
      startTime: 0,
      totalDuration: 1,
    });
    // 均等割り不可 → 固定秒扱い（末尾クリップ）
    expect(plans.length).toBeGreaterThanOrEqual(1);
    expect(plans[0].startTime).toBe(0);
    expect(plans[plans.length - 1].endTime).toBeLessThanOrEqual(1);
  });

  it('works without a video (totalDuration = 0) using fixed slots', () => {
    const plans = planBulkCaptions(['a', 'b'], 'fixed', {
      startTime: 0,
      totalDuration: 0,
    });
    expect(plans).toEqual([
      { text: 'a', startTime: 0, endTime: 3 },
      { text: 'b', startTime: 3, endTime: 6 },
    ]);
  });

  it('returns empty for no lines', () => {
    expect(planBulkCaptions([], 'even', { startTime: 0, totalDuration: 10 })).toEqual([]);
  });
});

describe('parseTimeNotation', () => {
  it('parses seconds, MM:SS and MM:SS.s formats', () => {
    expect(parseTimeNotation('63.5')).toBeCloseTo(63.5);
    expect(parseTimeNotation('01:03')).toBe(63);
    expect(parseTimeNotation('01:03.5')).toBeCloseTo(63.5);
    expect(parseTimeNotation('1:00:00')).toBe(3600);
  });

  it('rejects invalid formats', () => {
    expect(parseTimeNotation('abc')).toBeNull();
    expect(parseTimeNotation('1:2:3:4')).toBeNull();
    expect(parseTimeNotation('')).toBeNull();
  });
});

describe('parseBulkCaptionInput (time notation)', () => {
  it('parses leading [start-end] notation', () => {
    const lines = parseBulkCaptionInput('[00:03.0-00:07.5] 明日はいい日になるさ');
    expect(lines).toEqual([
      { text: '明日はいい日になるさ', explicitStart: 3, explicitEnd: 7.5 },
    ]);
  });

  it('does not misinterpret symbols in the body text', () => {
    // 本文中の @ や [ ] は時間指定として扱わない
    expect(parseBulkCaptionInput('恋は@（アットマーク）')).toEqual([
      { text: '恋は@（アットマーク）' },
    ]);
    expect(parseBulkCaptionInput('[サビ] ここから盛り上がる')).toEqual([
      { text: '[サビ] ここから盛り上がる' },
    ]);
    // 開始 >= 終了は無効 → 行全体を本文扱い
    expect(parseBulkCaptionInput('[00:10-00:05] 逆転')).toEqual([
      { text: '[00:10-00:05] 逆転' },
    ]);
  });

  it('round-trips through formatCaptionsAsBulkText', () => {
    const captions = [
      { text: '一行目', startTime: 0, endTime: 3.5 },
      { text: '二行目 [注釈]', startTime: 3.8, endTime: 70.2 },
    ];
    const text = formatCaptionsAsBulkText(captions);
    const parsed = parseBulkCaptionInput(text);
    expect(parsed).toEqual([
      { text: '一行目', explicitStart: 0, explicitEnd: 3.5 },
      { text: '二行目 [注釈]', explicitStart: 3.8, explicitEnd: 70.2 },
    ]);
  });
});

describe('planBulkCaptions (gap & explicit times)', () => {
  it('inserts the selected gap between fixed-duration captions', () => {
    const plans = planBulkCaptions(['a', 'b'], 'fixed', {
      startTime: 0,
      totalDuration: 60,
      fixedDurationSec: 3,
      gapSec: 0.3,
    });
    expect(plans[0]).toMatchObject({ startTime: 0, endTime: 3 });
    expect(plans[1]).toMatchObject({ startTime: 3.3, endTime: 6.3 });
  });

  it('inserts the gap in even mode and keeps the last end at the video end', () => {
    const plans = planBulkCaptions(['a', 'b'], 'even', {
      startTime: 0,
      totalDuration: 10,
      gapSec: 0.5,
    });
    // slot = (10 - 0.5) / 2 = 4.75 → 丸めて 4.8
    expect(plans[0].startTime).toBe(0);
    expect(plans[0].endTime).toBeCloseTo(4.8, 1);
    expect(plans[1].startTime).toBeCloseTo(5.3, 1);
    expect(plans[1].endTime).toBe(10);
  });

  it('uses explicit times as-is and continues auto lines after them', () => {
    const lines = parseBulkCaptionInput('自動1\n[00:10-00:15] 明示\n自動2');
    const plans = planBulkCaptions(lines, 'even', {
      startTime: 0,
      totalDuration: 60,
      fixedDurationSec: 3,
      gapSec: 0.5,
    });
    // 明示時間が混在 → even は使わず逐次配置
    expect(plans[0]).toMatchObject({ startTime: 0, endTime: 3 });
    expect(plans[1]).toMatchObject({ startTime: 10, endTime: 15 });
    expect(plans[2]).toMatchObject({ startTime: 15.5, endTime: 18.5 });
  });

  it('respects the custom fixed duration', () => {
    const plans = planBulkCaptions(['a'], 'fixed', {
      startTime: 0,
      totalDuration: 60,
      fixedDurationSec: 5,
    });
    expect(plans[0]).toMatchObject({ startTime: 0, endTime: 5 });
  });
});

describe('parseBulkCaptionInput (suffix notation)', () => {
  it('parses trailing [start-end] notation', () => {
    expect(parseBulkCaptionInput('明日はいい日になるさ [00:03-00:07.5]')).toEqual([
      { text: '明日はいい日になるさ', explicitStart: 3, explicitEnd: 7.5 },
    ]);
  });

  it('prefers prefix notation when both are present', () => {
    // 行頭形式が優先され、行末の [ ] は本文扱い
    expect(parseBulkCaptionInput('[00:01-00:02] 本文 [00:10-00:20]')).toEqual([
      { text: '本文 [00:10-00:20]', explicitStart: 1, explicitEnd: 2 },
    ]);
  });

  it('treats invalid trailing brackets as body text', () => {
    expect(parseBulkCaptionInput('コーラス [サビ]')).toEqual([
      { text: 'コーラス [サビ]' },
    ]);
  });
});

describe('assignBulkCaptionIds', () => {
  const caption = (id: string, text: string, startTime: number, endTime: number) => ({
    id,
    text,
    startTime,
    endTime,
  });
  const plan = (text: string, startTime: number, endTime: number) => ({ text, startTime, endTime });

  it('keeps ids for unmodified rows after deleting a middle row (regression guard)', () => {
    // 行 2 を削除しても、以降のキャプションのスタイル（id）が 1 つ隣へずれない
    const captions = [
      caption('c1', 'あ', 0, 3),
      caption('c2', 'い', 3, 6),
      caption('c3', 'う', 6, 9),
    ];
    const plans = [plan('あ', 0, 3), plan('う', 6, 9)];
    const result = assignBulkCaptionIds(plans, captions);
    expect(result[0].id).toBe('c1');
    expect(result[1].id).toBe('c3');
  });

  it('keeps the id of an edited row between anchors', () => {
    const captions = [
      caption('c1', 'あ', 0, 3),
      caption('c2', 'い', 3, 6),
      caption('c3', 'う', 6, 9),
    ];
    const plans = [plan('あ', 0, 3), plan('い（修正）', 3, 6.5), plan('う', 6.6, 9)];
    // 3 行目は時間も変えたのでアンカーではないが、位置合わせで id を維持する
    const result = assignBulkCaptionIds(plans, captions);
    expect(result[0].id).toBe('c1');
    expect(result[1].id).toBe('c2');
    expect(result[2].id).toBe('c3');
  });

  it('assigns no id to inserted rows', () => {
    const captions = [caption('c1', 'あ', 0, 3), caption('c2', 'い', 3, 6)];
    const plans = [plan('あ', 0, 3), plan('新規', 3, 4), plan('い', 4, 6)];
    const result = assignBulkCaptionIds(plans, captions);
    expect(result[0].id).toBe('c1');
    expect(result[1].id).toBeUndefined();
    // 「い」は時間を変えたのでアンカーにならないが、位置合わせで新規行の後の既存 c2 と対応する
    expect(result[2].id).toBe('c2');
  });

  it('falls back to positional matching when every row was edited', () => {
    const captions = [caption('c1', 'あ', 0, 3), caption('c2', 'い', 3, 6)];
    const plans = [plan('あ！', 0, 3.5), plan('い！', 3.5, 6)];
    const result = assignBulkCaptionIds(plans, captions);
    expect(result[0].id).toBe('c1');
    expect(result[1].id).toBe('c2');
  });

  it('matches captions whose stored times have sub-0.1s precision', () => {
    // プリフィルは 0.1 秒精度に丸めて表示されるため、未編集行は丸め比較で一致する
    const captions = [caption('c1', 'あ', 0.04, 2.96)];
    const plans = [plan('あ', 0, 3)];
    expect(assignBulkCaptionIds(plans, captions)[0].id).toBe('c1');
  });
});

describe('sequential caption round-trip (⏎ marker)', () => {
  it('encodes card-internal newlines as ⏎ in bulk text and decodes back', () => {
    const captions = [
      { text: 'この工場では\n最先端の設備で\n開発しています', startTime: 0, endTime: 12 },
      { text: '単一行', startTime: 12, endTime: 15 },
    ];
    const text = formatCaptionsAsBulkText(captions);
    // 1 カード = 1 行のまま（改行はマーカーに畳まれる）
    expect(text.split('\n')).toHaveLength(2);
    expect(text).toContain('この工場では⏎最先端の設備で⏎開発しています');

    const parsed = parseBulkCaptionInput(text);
    expect(parsed[0].text).toBe('この工場では\n最先端の設備で\n開発しています');
    expect(parsed[0].explicitStart).toBe(0);
    expect(parsed[0].explicitEnd).toBe(12);
    expect(parsed[1].text).toBe('単一行');
  });

  it('decodes ⏎ in plain lines without time notation', () => {
    expect(parseBulkCaptionInput('あ⏎い')).toEqual([{ text: 'あ\nい' }]);
  });
});

describe('collapseBlankLineBlocks (空行で区切るモード)', () => {
  it('collapses blank-line separated blocks into ⏎-joined single lines', () => {
    const input = 'この工場では\n最先端の設備で\n開発しています\n\n次の説明';
    expect(collapseBlankLineBlocks(input)).toBe(
      'この工場では⏎最先端の設備で⏎開発しています\n次の説明',
    );
  });

  it('keeps time notation on the first line of a block usable', () => {
    const collapsed = collapseBlankLineBlocks('[00:01-00:07] あ\nい\n\nう');
    const parsed = parseBulkCaptionInput(collapsed);
    expect(parsed[0]).toEqual({ text: 'あ\nい', explicitStart: 1, explicitEnd: 7 });
    expect(parsed[1]).toEqual({ text: 'う' });
  });

  it('ignores leading/trailing blank lines and multiple separators', () => {
    expect(collapseBlankLineBlocks('\n\nあ\n\n\n\nい\n\n')).toBe('あ\nい');
  });
});

describe('planBulkCaptions (時分割カードの行数加重)', () => {
  it('gives a multi-line card N× the fixed duration', () => {
    const plans = planBulkCaptions(
      [{ text: 'あ\nい\nう' }, { text: 'え' }],
      'fixed',
      { startTime: 0, totalDuration: 60, fixedDurationSec: 3 },
    );
    // 3 行の時分割カードは 3 × 3 = 9 秒、単一行は 3 秒
    expect(plans[0]).toMatchObject({ startTime: 0, endTime: 9 });
    expect(plans[1]).toMatchObject({ startTime: 9, endTime: 12 });
  });

  it('weights even distribution by displayed line count', () => {
    const plans = planBulkCaptions(
      [{ text: 'あ\nい\nう' }, { text: 'え' }],
      'even',
      { startTime: 0, totalDuration: 40 },
    );
    // 重み 3:1 → 30 秒 / 10 秒
    expect(plans[0]).toMatchObject({ startTime: 0, endTime: 30 });
    expect(plans[1]).toMatchObject({ startTime: 30, endTime: 40 });
  });
});

describe('bulk caption split mode conversion', () => {
  it('supports normal cards and a time-split card in the same hybrid input', () => {
    const normalized = normalizeBulkCaptionText(
      '通常カードA\n時分割A\n+ 時分割B\n+ 時分割C\n通常カードB',
      'hybrid',
    );
    expect(parseBulkCaptionInput(normalized)).toEqual([
      { text: '通常カードA' },
      { text: '時分割A\n時分割B\n時分割C' },
      { text: '通常カードB' },
    ]);
  });

  it('expands a blank-line time-split block when returning to one-line cards', () => {
    const input = '[00:01-00:07] 1行目\n2行目\n3行目\n\n次のカード';
    expect(convertBulkCaptionTextMode(input, 'block', 'line')).toBe(
      '[00:01-00:07] 1行目\n2行目\n3行目\n次のカード',
    );
  });

  it('keeps one-line cards separate when switching to blank-line mode', () => {
    expect(convertBulkCaptionTextMode('A\nB\nC', 'line', 'block')).toBe('A\n\nB\n\nC');
  });

  it('preserves time-split structure between hybrid and blank-line modes', () => {
    const hybrid = '[00:01-00:07] A\n+ B\nC';
    const block = convertBulkCaptionTextMode(hybrid, 'hybrid', 'block');
    expect(block).toBe('[00:01-00:07] A\nB\n\nC');
    expect(convertBulkCaptionTextMode(block, 'block', 'hybrid')).toBe(hybrid);
  });

  it('formats existing sequential captions without exposing the legacy marker in hybrid mode', () => {
    const text = formatCaptionsAsBulkText([
      { text: 'A\nB', startTime: 1, endTime: 7 },
      { text: 'C', startTime: 7, endTime: 9 },
    ], 'hybrid');
    expect(text).toBe('[00:01.0-00:07.0] A\n+ B\n[00:07.0-00:09.0] C');
    expect(text).not.toContain('⏎');
    expect(parseBulkCaptionInput(normalizeBulkCaptionText(text, 'hybrid'))[0].text).toBe('A\nB');
  });
});

describe('stripBulkCaptionTimeNotations', () => {
  it('removes only valid prefix and suffix time notations while preserving sentences and layout', () => {
    const input = '[00:01-00:04] 最初\n+ 続き\n\n最後 [00:05-00:08]';
    expect(stripBulkCaptionTimeNotations(input)).toBe('最初\n+ 続き\n\n最後');
  });

  it('keeps invalid time ranges and ordinary brackets as text', () => {
    const input = '[サビ] 本文\n[00:10-00:05] 逆転';
    expect(stripBulkCaptionTimeNotations(input)).toBe(input);
  });
});
