/**
 * ナレーション場面・区間語り口調の純ロジックテスト
 */
import { describe, expect, it } from 'vitest';
import {
  buildNarrationTtsPrompt,
  buildOpenMarker,
  buildTaggedNarrationBody,
  clearAllDeliveryMarkers,
  listAppliedToneLabels,
  parseDeliveryMarkup,
  resolveToneTagFromMarkerBody,
  stripDeliveryMarkers,
  toEnglishAudioTag,
  unwrapRangeTone,
  wrapRangeWithTone,
} from '../utils/narrationDelivery';

describe('wrapRangeWithTone / stripDeliveryMarkers', () => {
  it('選択範囲を語り口調マーカーで包む', () => {
    const source = 'こんにちは。今日は商品の紹介です。';
    const start = source.indexOf('今日');
    const end = source.length;
    const { text, caret } = wrapRangeWithTone(source, start, end, '明るく');
    expect(text).toContain('《明るく》今日は商品の紹介です。《/》');
    expect(text.startsWith('こんにちは。')).toBe(true);
    expect(caret).toBe(text.length);
    expect(stripDeliveryMarkers(text)).toBe(source);
  });

  it('自由入力の語り口調にコロンを付けない', () => {
    const { text } = wrapRangeWithTone('注意してください。', 0, 8, '少し早めに、緊迫感を持って');
    expect(text).toMatch(/^《少し早めに、緊迫感を持って》/);
    expect(text).not.toMatch(/^《:/);
    expect(stripDeliveryMarkers(text)).toBe('注意してください。');
  });

  it('buildOpenMarker はカスタムでもコロンなし', () => {
    expect(buildOpenMarker('コミカルな声で')).toBe('《コミカルな声で》');
    expect(buildOpenMarker('明るく')).toBe('《明るく》');
  });

  it('空選択では変更しない', () => {
    const source = 'あいうえお';
    expect(wrapRangeWithTone(source, 2, 2, '明るく').text).toBe(source);
  });

  it('clearAllDeliveryMarkers ですべて外せる', () => {
    const marked = '《明るく》A《/》《落ち着いて》B《/》C';
    expect(clearAllDeliveryMarkers(marked)).toBe('ABC');
  });
});

describe('unwrapRangeTone（選択範囲の語り口調解除）', () => {
  it('マーカーを含む選択から語り口調だけ外す', () => {
    const script = '前。《明るく》こんにちは。《/》後。';
    const start = script.indexOf('《');
    const end = script.indexOf('》', script.indexOf('《/》')) + 1;
    const { text } = unwrapRangeTone(script, start, end);
    expect(text).toBe('前。こんにちは。後。');
  });

  it('キャレットが語り口調区間内ならその区間を外す', () => {
    const script = '前。《明るく》こんにちは。《/》後。';
    const caret = script.indexOf('こん');
    const { text } = unwrapRangeTone(script, caret, caret);
    expect(text).toBe('前。こんにちは。後。');
  });

  it('語り口調がない選択では変更しない', () => {
    const script = 'ただの文章です。';
    expect(unwrapRangeTone(script, 0, 3).text).toBe(script);
  });
});

describe('parseDeliveryMarkup', () => {
  it('区間ごとのトーンを分解する', () => {
    const script = '前置き。《明るく》こんにちは。《/》本文。《強調して》注意。《/》';
    const segs = parseDeliveryMarkup(script);
    expect(segs.map((s) => ({ t: s.text, l: s.toneLabel, tag: s.toneTag }))).toEqual([
      { t: '前置き。', l: null, tag: null },
      { t: 'こんにちは。', l: '明るく', tag: 'bright' },
      { t: '本文。', l: null, tag: null },
      { t: '注意。', l: '強調して', tag: 'emphasize' },
    ]);
  });

  it('旧コロン付きカスタムマーカーも読める', () => {
    const script = '《:コミカルな声で》とってもひんやり《/》';
    const segs = parseDeliveryMarkup(script);
    expect(segs).toHaveLength(1);
    expect(segs[0]?.toneLabel).toBe('コミカルな声で');
    expect(segs[0]?.toneTag).toBe('comical');
    expect(segs[0]?.text).toBe('とってもひんやり');
  });

  it('コロンなしカスタムも短い英語タグへマップする', () => {
    const script = '《コミカルな声で》こんな素敵な環境《/》《強調して》もっとひんやり《/》';
    const segs = parseDeliveryMarkup(script);
    expect(segs[0]?.toneTag).toBe('comical');
    expect(segs[1]?.toneTag).toBe('emphasize');
  });

  it('listAppliedToneLabels は出現順で重複なし', () => {
    const script = '《明るく》A《/》《落ち着いて》B《/》《明るく》C《/》';
    expect(listAppliedToneLabels(script)).toEqual(['明るく', '落ち着いて']);
  });
});

describe('toEnglishAudioTag / resolveToneTagFromMarkerBody', () => {
  it('日本語カスタムを短い英語 audio tag に変換する', () => {
    expect(toEnglishAudioTag('コミカルな声で')).toBe('comical');
    expect(toEnglishAudioTag('ささやき声')).toBe('whispers');
    expect(resolveToneTagFromMarkerBody(':早口で').tag).toBe('fast');
  });

  it('プリセットは公式例どおり短い英語タグ', () => {
    expect(resolveToneTagFromMarkerBody('強調して').tag).toBe('emphasize');
    expect(resolveToneTagFromMarkerBody('明るく').tag).toBe('bright');
    expect(resolveToneTagFromMarkerBody('はっきり').tag).toBe('clear');
  });
});

describe('buildTaggedNarrationBody / buildNarrationTtsPrompt', () => {
  it('公式例どおり [tag] text [tag] text の短いインライン形式', () => {
    const script =
      '《明るく》モジュール3へようこそ。《/》《はっきり》この節では注意点を説明します。《/》';
    const body = buildTaggedNarrationBody(script);
    expect(body).toBe(
      '[bright] モジュール3へようこそ。 [clear] この節では注意点を説明します。',
    );
  });

  it('制御なしなら単純な Say the following プロンプト', () => {
    const { prompt, plainText, hasDeliveryControl } = buildNarrationTtsPrompt({
      scene: '',
      script: 'こんにちは。',
    });
    expect(hasDeliveryControl).toBe(false);
    expect(plainText).toBe('こんにちは。');
    expect(prompt).toContain('Say the following Japanese text');
    expect(prompt).toContain('こんにちは。');
  });

  it('公式どおり Scene / Sample Context / 短いタグ本文', () => {
    const script = '《明るく》こんにちは。《/》説明です。';
    const { prompt, plainText, taggedBody, hasDeliveryControl } = buildNarrationTtsPrompt({
      scene: {
        scene: '商品紹介の撮影現場。',
        sampleContext:
          '親しみやすく商品やサービスを紹介する。明るく聞き取りやすいペース。口調はフレンドリーで分かりやすい。',
      },
      script,
    });
    expect(hasDeliveryControl).toBe(true);
    expect(plainText).toBe('こんにちは。説明です。');
    expect(taggedBody).toBe('[bright] こんにちは。説明です。');

    expect(prompt).toContain('Scene\n');
    expect(prompt).toContain('Sample Context\n');
    expect(prompt).toContain('[bright] こんにちは。説明です。');
    expect(prompt).toContain('must never be spoken');
    // 過剰な Advanced 構造は使わない
    expect(prompt).not.toContain('# AUDIO PROFILE');
    expect(prompt).not.toContain("### DIRECTOR'S NOTES");
    expect(prompt).not.toContain('#### TRANSCRIPT');
    // 商品紹介プリセットの英語 Scene
    expect(prompt).toMatch(/product|showcase|commercial/i);
  });

  it('ユーザー例は短い [comical] / [emphasize] になる', () => {
    const script =
      '《コミカルな声で》とってもひんやりして気持ちいい《/》' +
      '《コミカルな声で》こんな素敵な環境は初めてです《/》' +
      '《強調して》これからももっとひんやりしよう《/》';
    const { prompt, plainText, taggedBody } = buildNarrationTtsPrompt({
      scene: {
        scene: '涼しい屋外のロケ。',
        sampleContext: '楽しげに涼しさを伝える。',
      },
      script,
    });
    expect(plainText).toBe(
      'とってもひんやりして気持ちいいこんな素敵な環境は初めてですこれからももっとひんやりしよう',
    );
    expect(taggedBody).toBe(
      '[comical] とってもひんやりして気持ちいい [comical] こんな素敵な環境は初めてです [emphasize] これからももっとひんやりしよう',
    );
    expect(prompt).toContain('Scene\n涼しい屋外のロケ。');
    expect(prompt).toContain('Sample Context\n楽しげに涼しさを伝える。');
    expect(prompt).toContain(taggedBody);
    expect(prompt).not.toContain('《');
    // タグに長文を埋め込まない
    expect(prompt).not.toMatch(/\[comically,/);
    expect(prompt).not.toMatch(/playful cartoonish/);
  });
});
