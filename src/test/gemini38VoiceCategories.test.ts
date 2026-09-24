import { describe, expect, it } from 'vitest';
import {
  VOICE_PURPOSE_GROUPS,
  formatContextLabel,
  formatPersonaLabel,
  getContextSelectOptions,
  getPersonaSelectOptions,
  voiceMatchesPurposeGroup,
} from '../utils/gemini38VoiceCategories';
import type { Gemini38Voice } from '../utils/gemini38Voices';

describe('gemini38VoiceCategories', () => {
  it('VOICE_PURPOSE_GROUPS は代表的な用途グループが定義されている', () => {
    expect(VOICE_PURPOSE_GROUPS.length).toBeGreaterThan(0);
    expect(VOICE_PURPOSE_GROUPS.map((g) => g.id)).toContain('narration');
    expect(VOICE_PURPOSE_GROUPS.map((g) => g.id)).toContain('storytelling');
  });

  const sampleVoices: Gemini38Voice[] = [
    {
      id: 'voice_1',
      label: 'ナレーターA',
      description: '落ち着いた声',
      gender: 'female',
      languageCode: 'ja-JP',
      persona: 'Video Voiceover',
      context: 'Video',
      type: 'prebuilt',
    },
    {
      id: 'voice_2',
      label: '教師B',
      description: 'わかりやすい声',
      gender: 'male',
      languageCode: 'ja-JP',
      persona: 'Teacher',
      context: 'Education',
      type: 'prebuilt',
    },
    {
      id: 'voice_3',
      label: 'ストーリーテラーC',
      description: '感情豊かな声',
      gender: 'female',
      languageCode: 'ja-JP',
      persona: 'Storyteller',
      context: 'Audiobook',
      type: 'prompted',
    },
    {
      id: 'voice_4',
      label: 'English Commercial',
      description: 'Energetic voice',
      gender: 'male',
      languageCode: 'en-US',
      persona: 'Commercial Announcer',
      context: 'Commercial',
      type: 'prebuilt',
    },
    {
      id: 'voice_unknown',
      label: '未知の分類',
      description: 'テスト用',
      gender: 'neutral',
      languageCode: 'ja-JP',
      persona: 'UniquePersona',
      context: 'UniqueContext',
      type: 'replicated',
    },
  ];

  it('formatPersonaLabel は既知の英語を日本語と英語の併記で返し、未知の英語はそのまま返す', () => {
    expect(formatPersonaLabel('Video Voiceover')).toBe('動画ナレーション (Video Voiceover)');
    expect(formatPersonaLabel('Teacher')).toBe('教師・講師 (Teacher)');
    expect(formatPersonaLabel('Companion & Peer / Digital Assistant (Friend)')).toBe('対話・AIアシスタント: 友人 (Friend)');
    expect(formatPersonaLabel('Educational Tutor (Professor)')).toBe('教育・講師: 大学教授 (Professor)');
    expect(formatPersonaLabel('UniquePersona')).toBe('UniquePersona');
    expect(formatPersonaLabel('')).toBe('');
    expect(formatPersonaLabel('教師')).toBe('教師');
  });

  it('formatPersonaLabel は Google Voices API の複合語・物語・ドキュメンタリー・料理番組司会などを全て正しく日本語化する', () => {
    expect(formatPersonaLabel('News & Podcast Host / Podcaster (Podcast Interviewer)')).toBe(
      'ニュース・ポッドキャスト司会: ポッドキャスト取材 (Podcast Interviewer)',
    );
    expect(formatPersonaLabel('Storyteller & Narrator')).toBe(
      '物語朗読・ナレーション (Storyteller & Narrator)',
    );
    expect(formatPersonaLabel('Storyteller & Narrator (Nature Documentary Narrator)')).toBe(
      '物語朗読・ナレーション: 自然ドキュメンタリー (Nature Documentary Narrator)',
    );
    expect(formatPersonaLabel('Storyteller & Narrator (Philosopher)')).toBe(
      '物語朗読・ナレーション: 哲学者・思想家 (Philosopher)',
    );
    expect(formatPersonaLabel('Video Voiceover & Host / Training Voiceover (Cooking Show Host)')).toBe(
      '動画・研修ナレーション: 料理番組司会 (Cooking Show Host)',
    );
    expect(formatPersonaLabel('Video Voiceover & Host / Training Voiceover (Instructional Video Host)')).toBe(
      '動画・研修ナレーション: 操作説明司会 (Instructional Video Host)',
    );
    expect(formatPersonaLabel('Video Voiceover & Host / Training Voiceover (Librarian)')).toBe(
      '動画・研修ナレーション: 司書・案内人 (Librarian)',
    );
    expect(
      formatPersonaLabel(
        'Video Voiceover & Host / Training Voiceover (Trivia Host) | News & Podcast Host / Podcaster (Trivia Host)',
      ),
    ).toBe('動画・研修ナレーション: クイズ番組司会 (Trivia Host)');
  });

  it('formatPersonaLabel は Enterprise Agent（企業・ビジネス案内）の人物像を網羅的に日本語・英語併記に変換する', () => {
    // 単独ベース
    expect(formatPersonaLabel('Concierge & EA')).toBe('コンシェルジュ・秘書 (Concierge & EA)');
    expect(formatPersonaLabel('Tech Support Agent / Tech Advisor')).toBe(
      'テクニカルサポート・技術顧問 (Tech Support Agent / Tech Advisor)',
    );
    expect(formatPersonaLabel('Call Center Agent')).toBe('コールセンター案内 (Call Center Agent)');
    expect(formatPersonaLabel('Authoritative Advisor')).toBe('専門家・顧問 (Authoritative Advisor)');

    // 複合形式: Concierge & EA
    expect(formatPersonaLabel('Concierge & EA (Event Planner)')).toBe(
      'コンシェルジュ・秘書: イベント企画 (Event Planner)',
    );
    expect(formatPersonaLabel('Concierge & EA (Executive Assistant)')).toBe(
      'コンシェルジュ・秘書: 役員秘書 (Executive Assistant)',
    );
    expect(formatPersonaLabel('Concierge & EA (Hotel Concierge)')).toBe(
      'コンシェルジュ・秘書: ホテルコンシェルジュ (Hotel Concierge)',
    );
    expect(formatPersonaLabel('Concierge & EA (Tour Guide)')).toBe(
      'コンシェルジュ・秘書: 観光ガイド (Tour Guide)',
    );

    // 複合形式: Tech Support Agent / Tech Advisor
    expect(formatPersonaLabel('Tech Support Agent / Tech Advisor (Architect)')).toBe(
      'テクニカルサポート・技術顧問: 設計士・アーキテクト (Architect)',
    );
    expect(formatPersonaLabel('Tech Support Agent / Tech Advisor (Grandparent)')).toBe(
      'テクニカルサポート・技術顧問: 祖父母・シニア (Grandparent)',
    );
    expect(formatPersonaLabel('Tech Support Agent / Tech Advisor (Librarian)')).toBe(
      'テクニカルサポート・技術顧問: 司書・案内人 (Librarian)',
    );

    // 複合形式: カスタマー窓口・コールセンター
    expect(
      formatPersonaLabel('Customer Support / Call Center Agent (Customer Service Agent)'),
    ).toBe('カスタマー窓口・コールセンター: 案内担当 (Customer Service Agent)');
    expect(formatPersonaLabel('Customer Support / Call Center Agent (Sales Associate)')).toBe(
      'カスタマー窓口・コールセンター: 販売・営業 (Sales Associate)',
    );
    expect(formatPersonaLabel('Customer Support / Call Center Agent (Social Worker)')).toBe(
      'カスタマー窓口・コールセンター: ソーシャルワーカー (Social Worker)',
    );

    // 複合形式: 専門家・顧問
    expect(
      formatPersonaLabel('High-Trust Advisor / Authoritative Advisor (Researcher)'),
    ).toBe('専門家・顧問: 研究員・リサーチャー (Researcher)');
    expect(formatPersonaLabel('High-Trust Advisor / Authoritative Advisor (Doctor)')).toBe(
      '専門家・顧問: 医師 (Doctor)',
    );
    expect(
      formatPersonaLabel('High-Trust Advisor / Authoritative Advisor (Financial Advisor)'),
    ).toBe('専門家・顧問: 金融アドバイザー (Financial Advisor)');
    expect(formatPersonaLabel('High-Trust Advisor / Authoritative Advisor (Lawyer)')).toBe(
      '専門家・顧問: 弁護士 (Lawyer)',
    );
    expect(formatPersonaLabel('Authoritative Advisor (Researcher)')).toBe(
      '専門家・顧問: 研究員・リサーチャー (Researcher)',
    );
  });

  it('formatPersonaLabel は Advertising Pitch, Character & Theatrical, Coach / Motivational Guide などの人物像を網羅的に日本語・英語併記に変換する', () => {
    // 広告・セールスCMナレーション
    expect(
      formatPersonaLabel(
        'Advertising Pitch & Commerce / Commercial Voiceover (Chess Instructor)',
      ),
    ).toBe('広告・セールスCMナレーション: チェス講師 (Chess Instructor)');
    expect(
      formatPersonaLabel(
        'Advertising Pitch & Commerce / Commercial Voiceover (Fashion Consultant)',
      ),
    ).toBe('広告・セールスCMナレーション: ファッションコンサルタント (Fashion Consultant)');
    expect(
      formatPersonaLabel(
        'Advertising Pitch & Commerce / Commercial Voiceover (Influencer)',
      ),
    ).toBe('広告・セールスCMナレーション: インフルエンサー (Influencer)');
    expect(
      formatPersonaLabel(
        'Advertising Pitch & Commerce / Commercial Voiceover (Political Activist)',
      ),
    ).toBe('広告・セールスCMナレーション: 社会活動家 (Political Activist)');
    expect(
      formatPersonaLabel(
        'Advertising Pitch & Commerce / Commercial Voiceover (Architect)',
      ),
    ).toBe('広告・セールスCMナレーション: 設計士・アーキテクト (Architect)');

    // キャラクター・演技劇
    expect(
      formatPersonaLabel('Character & Theatrical (Person Giving Driving Directions)'),
    ).toBe('キャラクター・演技劇: 道案内・ナビゲーション (Person Giving Driving Directions)');

    // コーチ・モチベーション指導
    expect(
      formatPersonaLabel('Coach / Motivational Guide (Lifestyle Coach)'),
    ).toBe('コーチ・モチベーション指導: ライフスタイルコーチ (Lifestyle Coach)');
  });

  it('formatContextLabel は既知の英語を日本語と英語の併記で返し、未知の英語はそのまま返す', () => {
    expect(formatContextLabel('Content & Media')).toBe('動画・メディアコンテンツ (Content & Media)');
    expect(formatContextLabel('Conversational / Edu')).toBe('会話・教育・学習 (Conversational / Edu)');
    expect(formatContextLabel('Enterprise Agent')).toBe('企業・ビジネス案内 (Enterprise Agent)');
    expect(formatContextLabel('Commercial')).toBe('CM・広告 (Commercial)');
    expect(formatContextLabel('Education')).toBe('教育・学習 (Education)');
    expect(formatContextLabel('UniqueContext')).toBe('UniqueContext');
    expect(formatContextLabel('')).toBe('');
    // すでに日本語の場合
    expect(formatContextLabel('教育')).toBe('教育');
  });

  it('voiceMatchesPurposeGroup は用途グループに応じて適切にフィルタリングする', () => {
    expect(voiceMatchesPurposeGroup(sampleVoices[0], 'all')).toBe(true);
    expect(voiceMatchesPurposeGroup(sampleVoices[0], 'narration')).toBe(true);
    expect(voiceMatchesPurposeGroup(sampleVoices[0], 'commercial')).toBe(false);

    expect(voiceMatchesPurposeGroup(sampleVoices[2], 'storytelling')).toBe(true);
    expect(voiceMatchesPurposeGroup(sampleVoices[2], 'narration')).toBe(false);

    expect(voiceMatchesPurposeGroup(sampleVoices[3], 'commercial')).toBe(true);
  });

  it('getPersonaSelectOptions は言語と用途グループで絞り込み、件数付きで返す', () => {
    const jaAll = getPersonaSelectOptions(sampleVoices, 'ja', 'all');
    expect(jaAll).toEqual(
      expect.arrayContaining([
        { value: 'Video Voiceover', label: '動画ナレーション (Video Voiceover)', count: 1 },
        { value: 'Teacher', label: '教師・講師 (Teacher)', count: 1 },
        { value: 'Storyteller', label: '物語の語り手 (Storyteller)', count: 1 },
        { value: 'UniquePersona', label: 'UniquePersona', count: 1 },
      ]),
    );

    const jaNarration = getPersonaSelectOptions(sampleVoices, 'ja', 'narration');
    const values = jaNarration.map((o) => o.value);
    expect(values).toContain('Video Voiceover');
    expect(values).toContain('Teacher');
    expect(values).not.toContain('Storyteller');
  });

  it('getContextSelectOptions は persona 選択に連動して適切なコンテキスト候補と件数を返す', () => {
    const optionsForTeacher = getContextSelectOptions(sampleVoices, 'ja', 'all', 'Teacher');
    expect(optionsForTeacher).toEqual([
      { value: 'Education', label: '教育・学習 (Education)', count: 1 },
    ]);
  });
});
