/**
 * Gemini TTS / Google AI Studio のボイス一覧が公式 30 声と一致していることを固定する。
 * 出典:
 * - voice_name / trait: https://ai.google.dev/gemini-api/docs/speech-generation#voices
 * - gender: https://docs.cloud.google.com/text-to-speech/docs/gemini-tts#voice_options
 *
 * 年齢層や詳細な利用シーン説明など、公式にない項目は載せない。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VOICE_ID,
  filterVoiceOptions,
  formatVoiceOptionLabel,
  isVoiceId,
  resolveVoiceSelectOptions,
  VOICE_OPTIONS,
} from '../constants';
import type { VoiceId } from '../types';

/** 公式ドキュメント順の voice_name・英語 trait・Cloud TTS 性別 */
const OFFICIAL_VOICES: ReadonlyArray<{
  id: VoiceId;
  traitEn: string;
  gender: 'female' | 'male';
}> = [
  { id: 'Zephyr', traitEn: 'Bright', gender: 'female' },
  { id: 'Puck', traitEn: 'Upbeat', gender: 'male' },
  { id: 'Charon', traitEn: 'Informative', gender: 'male' },
  { id: 'Kore', traitEn: 'Firm', gender: 'female' },
  { id: 'Fenrir', traitEn: 'Excitable', gender: 'male' },
  { id: 'Leda', traitEn: 'Youthful', gender: 'female' },
  { id: 'Orus', traitEn: 'Firm', gender: 'male' },
  { id: 'Aoede', traitEn: 'Breezy', gender: 'female' },
  { id: 'Callirrhoe', traitEn: 'Easy-going', gender: 'female' },
  { id: 'Autonoe', traitEn: 'Bright', gender: 'female' },
  { id: 'Enceladus', traitEn: 'Breathy', gender: 'male' },
  { id: 'Iapetus', traitEn: 'Clear', gender: 'male' },
  { id: 'Umbriel', traitEn: 'Easy-going', gender: 'male' },
  { id: 'Algieba', traitEn: 'Smooth', gender: 'male' },
  { id: 'Despina', traitEn: 'Smooth', gender: 'female' },
  { id: 'Erinome', traitEn: 'Clear', gender: 'female' },
  { id: 'Algenib', traitEn: 'Gravelly', gender: 'male' },
  { id: 'Rasalgethi', traitEn: 'Informative', gender: 'male' },
  { id: 'Laomedeia', traitEn: 'Upbeat', gender: 'female' },
  { id: 'Achernar', traitEn: 'Soft', gender: 'female' },
  { id: 'Alnilam', traitEn: 'Firm', gender: 'male' },
  { id: 'Schedar', traitEn: 'Even', gender: 'male' },
  { id: 'Gacrux', traitEn: 'Mature', gender: 'female' },
  { id: 'Pulcherrima', traitEn: 'Forward', gender: 'female' },
  { id: 'Achird', traitEn: 'Friendly', gender: 'male' },
  { id: 'Zubenelgenubi', traitEn: 'Casual', gender: 'male' },
  { id: 'Vindemiatrix', traitEn: 'Gentle', gender: 'female' },
  { id: 'Sadachbia', traitEn: 'Lively', gender: 'male' },
  { id: 'Sadaltager', traitEn: 'Knowledgeable', gender: 'male' },
  { id: 'Sulafat', traitEn: 'Warm', gender: 'female' },
];

describe('VOICE_OPTIONS（Gemini TTS 公式ボイス）', () => {
  it('公式 30 声を漏れなく・重複なく持つ', () => {
    expect(VOICE_OPTIONS).toHaveLength(30);
    const ids = VOICE_OPTIONS.map((v) => v.id);
    expect(new Set(ids).size).toBe(30);
    expect(ids).toEqual(OFFICIAL_VOICES.map((v) => v.id));
  });

  it('公式の voice_name / trait / gender のみを持つ（推測フィールドを載せない）', () => {
    for (const official of OFFICIAL_VOICES) {
      const option = VOICE_OPTIONS.find((v) => v.id === official.id)!;
      expect(option.label).toBe(option.id);
      expect(option.traitEn).toBe(official.traitEn);
      expect(option.desc).toContain(official.traitEn);
      expect(option.gender).toBe(official.gender);
      // 公式にない推測フィールドは持たない
      expect(option).not.toHaveProperty('ageBand');
      expect(option).not.toHaveProperty('summary');
      expect(option).not.toHaveProperty('bestFor');
    }
    expect(VOICE_OPTIONS.filter((v) => v.gender === 'female')).toHaveLength(14);
    expect(VOICE_OPTIONS.filter((v) => v.gender === 'male')).toHaveLength(16);
  });

  it('既定ボイスは既存互換の Aoede', () => {
    expect(DEFAULT_VOICE_ID).toBe('Aoede');
    expect(isVoiceId('Aoede')).toBe(true);
    expect(isVoiceId('NotAVoice')).toBe(false);
  });
});

describe('声の絞り込みヘルパー', () => {
  it('女性 / 男性で絞り込める', () => {
    expect(filterVoiceOptions(VOICE_OPTIONS, 'female').every((v) => v.gender === 'female')).toBe(
      true,
    );
    expect(filterVoiceOptions(VOICE_OPTIONS, 'male').every((v) => v.gender === 'male')).toBe(true);
    expect(filterVoiceOptions(VOICE_OPTIONS, 'all')).toHaveLength(30);
  });

  it('選択中の声がフィルタ外でもセレクト一覧に残る', () => {
    const list = resolveVoiceSelectOptions(VOICE_OPTIONS, 'female', 'Puck');
    expect(list[0]?.id).toBe('Puck');
    expect(list.slice(1).every((v) => v.gender === 'female')).toBe(true);
  });

  it('表示ラベルは性別 + 公式名 + 公式 trait のみ', () => {
    const aoede = VOICE_OPTIONS.find((v) => v.id === 'Aoede')!;
    expect(formatVoiceOptionLabel(aoede)).toBe('【女性】Aoede — 軽やか（Breezy）');
  });
});
