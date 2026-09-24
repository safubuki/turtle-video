/**
 * @file gemini38VoiceCategories.ts
 * @description Gemini 3.8 Extended Voice Library の分類・多言語表示（日本語＋英語）・フィルタリング用ユーティリティ。
 * Google AI Studio / Gemini API の Voices API 仕様に基づき、多すぎる候補を用途別に整理し、
 * 英語の persona / context を分かりやすい日本語併記で提示する。
 */
import type { Gemini38Voice } from './gemini38Voices';

/**
 * 動画制作・ナレーション生成における代表的な用途グループ（大分類）。
 * 互換性のために保持。
 */
export type VoicePurposeGroup =
  | 'all'
  | 'narration'
  | 'storytelling'
  | 'commercial'
  | 'character'
  | 'announcement';

export interface PurposeGroupOption {
  id: VoicePurposeGroup;
  label: string;
  labelEn: string;
  icon: string;
  description: string;
}

export const VOICE_PURPOSE_GROUPS: PurposeGroupOption[] = [
  { id: 'all', label: 'すべて', labelEn: 'All', icon: '✨', description: 'すべての音声を表示' },
  { id: 'narration', label: 'ナレーション・解説', labelEn: 'Narration & Explainer', icon: '🎙️', description: 'YouTube・解説動画・ドキュメンタリー・教育向け' },
  { id: 'storytelling', label: '朗読・物語', labelEn: 'Storytelling & Books', icon: '📖', description: 'オーディオブック・小説・昔話・ドラマ向け' },
  { id: 'commercial', label: 'CM・プロモーション', labelEn: 'Commercial & Promo', icon: '📢', description: '広告・PR・セールス・告知向け' },
  { id: 'character', label: '会話・キャラクター', labelEn: 'Conversational & Character', icon: '💬', description: '日常会話・アシスタント・ゲーム・親しみやすいトーン' },
  { id: 'announcement', label: 'アナウンス・案内', labelEn: 'Announcement & Guide', icon: 'ℹ️', description: 'ニュース・公共放送・電話案内・瞑想リラクゼーション' },
];

/**
 * 職業・人物像（persona）の英語から日本語訳への対応辞書。
 */
export const VOICE_PERSONA_TRANSLATIONS: Record<string, string> = {
  // ナレーション・解説・教育
  'Video Voiceover': '動画ナレーション',
  'Video Voiceover & Host': '動画・解説司会',
  'Video Voiceover & Host / Training Voiceover': '動画・研修ナレーション',
  'Training Voiceover': '研修・解説ナレーション',
  'Documentary Narrator': 'ドキュメンタリー',
  'Nature Documentary Narrator': '自然ドキュメンタリー',
  'Documentary': 'ドキュメンタリー',
  'Narrator': 'ナレーター',
  'Educational Instructor': '教育・講師',
  'Educational Tutor': '教育・講師',
  'Teacher': '教師・講師',
  'Instructor': 'インストラクター',
  'Instructional Video Host': '操作説明司会',
  'Explainer': '解説・説明',
  'Corporate Trainer': '企業研修講師',
  'Trainer': '研修講師',
  'Professor': '大学教授・専門家',
  'Expert': '専門家・解説者',
  'Presenter': 'プレゼンター',
  'Academic': '研究者・学術',
  'Technical Guide': 'テクニカル解説',
  'Writing Tutor': '文章指導',
  'Math Tutor': '数学講師',
  'Science Tutor': '科学講師',
  'Librarian': '司書・案内人',
  'Philosopher': '哲学者・思想家',
  'Cooking Show Host': '料理番組司会',
  'Trivia Host': 'クイズ番組司会',

  // 朗読・ストーリー・オーディオブック
  'Storyteller & Narrator': '物語朗読・ナレーション',
  'Narrator / Storyteller': '朗読・ナレーション',
  'Audiobook Narrator': 'オーディオブック朗読',
  'Audiobook': 'オーディオブック朗読',
  'Storyteller': '物語の語り手',
  'Fiction Narrator': '小説朗読',
  'Non-Fiction Narrator': 'ノンフィクション朗読',
  'Children Storyteller': '子ども向け読み聞かせ',
  'Bedtime Story Narrator': 'おやすみ朗読',
  'Poet': '詩の朗読',
  'Drama Actor': 'ドラマ声優・俳優',

  // 広告・プロモーション・CM・セールス
  'Advertising Pitch & Commerce / Commercial Voiceover': '広告・セールスCMナレーション',
  'Advertising Pitch & Commerce': '広告・セールス',
  'Commercial Voiceover': 'CMナレーション',
  'Advertising Pitch': '広告セールス',
  'Commerce': 'コマース・販売',
  'Commercial Announcer': 'CMアナウンサー',
  'Commercial': 'CM・広告',
  'Commercial / Marketing': '広告・プロモーション',
  'Promo Announcer': 'プロモーションアナウンサー',
  'Advertiser': '広告ナレーター',
  'Salesperson': 'セールス・実演販売',
  'Pitchman': 'プレゼン・セールス',
  'Marketer': 'マーケティング・PR',
  'Announcer': 'アナウンサー',
  'Influencer': 'インフルエンサー',
  'Brand Ambassador': 'ブランドアンバサダー',
  'Product Reviewer': '製品レビュアー',
  'Auctioneer': '競売人・オークショニア',
  'Real Estate Agent': '不動産エージェント',
  'Car Dealer': 'カーディーラー',

  // 報道・公共・案内・メディア
  'News & Podcast Host / Podcaster': 'ニュース・ポッドキャスト司会',
  'News & Podcast Host': 'ニュース・ポッドキャスト司会',
  'Podcaster': 'ポッドキャスト司会',
  'Podcast Interviewer': 'ポッドキャスト取材',
  'Podcast Host': 'ポッドキャスト司会',
  'Radio Host': 'ラジオ司会',
  'News Anchor': 'ニュースキャスター',
  'News Reporter': 'ニュースリポーター',
  'News Reader': 'ニュース報道',
  'Journalist': 'ジャーナリスト',
  'Public Announcer': '館内・公共アナウンス',
  'Broadcaster / Entertainer': '放送・エンタメ',
  'Broadcaster': '放送アナウンサー',
  'Customer Service Representative': 'カスタマーサポート案内',
  'Customer Service / Support': 'サポート案内',
  'Customer Support Agent': 'カスタマーサポート',
  'Customer Support': 'カスタマーサポート',
  'Customer Service': 'カスタマー対応',
  'Customer Service Agent': '案内担当',
  'Sales Associate': '販売・営業',
  'Social Worker': 'ソーシャルワーカー',
  'Support Specialist': 'サポート専門員',
  'Operator': 'オペレーター',
  'IVR / Phone Operator': '電話自動案内 (IVR)',
  'Tour Guide': '観光ガイド',
  'Museum Guide': '美術館・博物館案内',
  'Meditation Guide': '瞑想・リラクゼーション',
  'Wellness Coach': 'ウェルネス・健康コーチ',

  // 企業・ビジネス・コンシェルジュ・専門家
  'Concierge & EA': 'コンシェルジュ・秘書',
  'Concierge & Executive Assistant': 'コンシェルジュ・役員秘書',
  'Concierge': 'コンシェルジュ',
  'Executive Assistant': '役員秘書',
  'Event Planner': 'イベント企画',
  'Hotel Concierge': 'ホテルコンシェルジュ',
  'Tech Support Agent / Tech Advisor': 'テクニカルサポート・技術顧問',
  'Tech Support Agent': 'テクニカルサポート',
  'Tech Advisor': '技術顧問',
  'Tech Support': 'テクニカルサポート',
  'Architect': '設計士・アーキテクト',
  'Grandparent': '祖父母・シニア',
  'Customer Support / Call Center Agent': 'カスタマー窓口・コールセンター',
  'Customer Service / Call Center Agent': 'カスタマー窓口・コールセンター',
  'Call Center Agent': 'コールセンター案内',
  'High-Trust Advisor / Authoritative Advisor': '専門家・顧問',
  'High-Trust Advisor / Authority': '専門家・顧問',
  'Authoritative Advisor': '専門家・顧問',
  'Researcher': '研究員・リサーチャー',
  'Doctor': '医師',
  'Lawyer': '弁護士',
  'Financial Advisor': '金融アドバイザー',
  'Accountant': '会計士',
  'Scientist': '科学者',
  'Consultant': 'コンサルタント',
  'Fashion Consultant': 'ファッションコンサルタント',
  'Chess Instructor': 'チェス講師',
  'Political Activist': '社会活動家',
  'Analyst': '分析官・アナリスト',
  'IT Specialist': 'IT専門員',
  'Help Desk': 'ヘルプデスク',
  'Receptionist': '受付担当',
  'Caregiver': '介護士・ケアスタッフ',
  'Counselor': 'カウンセラー・相談員',

  // コーチ・ウェルネス・自己啓発・案内
  'Coach / Motivational Guide': 'コーチ・モチベーション指導',
  'Motivational Guide': 'モチベーション指導',
  'Coach': 'コーチ',
  'Lifestyle Coach': 'ライフスタイルコーチ',
  'Life Coach': 'ライフコーチ',
  'Mindfulness Coach': 'マインドフルネスコーチ',
  'Fitness Coach': 'フィットネスコーチ',
  'Personal Trainer': 'パーソナルトレーナー',
  'Nutritionist': '栄養士',
  'Person Giving Driving Directions': '道案内・ナビゲーション',
  'Driving Directions': '道案内・ナビゲーション',

  // 会話・キャラクター・日常・劇
  'Character & Theatrical': 'キャラクター・演技劇',
  'Theatrical': '演劇・ドラマ',
  'Companion & Peer / Digital Assistant': '対話・AIアシスタント',
  'Companion & Peer': '対話・相棒',
  'Digital Assistant': 'AIアシスタント',
  'Conversationalist': '日常会話・フリートーク',
  'Casual Conversationalist': 'カジュアルな会話',
  'Friendly Companion': '親しみやすい友人',
  'Best Friend': '親友',
  'Friend': '友人・会話相手',
  'Parent': '親・保護者',
  'Sibling': '兄弟・姉妹',
  'Virtual Assistant': 'AIアシスタント',
  'Assistant': 'アシスタント',
  'Content Creator / Influencer': '動画クリエイター',
  'High-Trust Advisor': '専門家・アドバイザー',
  'Game Character': 'ゲームキャラクター',
  'Hero': '主人公・ヒーロー',
  'Villain': '悪役・ライバル',
  'Sidekick': '相棒・サポート',
  'Elderly Storyteller': 'おじいさん・おばあさん',
  'Youth': '若者・少年少女',
  'Host': '番組司会・ホスト',
  'Interviewer': 'インタビュアー',
};

/**
 * シーン・用途（context）の英語から日本語訳への対応辞書。
 * Google AI Studio / Gemini Voices API で実際に使われているカテゴリ名を網羅。
 */
export const VOICE_CONTEXT_TRANSLATIONS: Record<string, string> = {
  // Google Voices API の主要カテゴリ
  'Content & Media': '動画・メディアコンテンツ',
  'Conversational / Edu': '会話・教育・学習',
  'Enterprise Agent': '企業・ビジネス案内',
  'Entertainment & Gaming': 'エンタメ・ゲーム',
  'Growth & Marketing': '広告・プロモーション',
  'Wellness & Culture': 'ウェルネス・文化・教養',

  // その他の個別・派生カテゴリ
  'Content': 'コンテンツ・映像',
  'Media': 'メディア・放送',
  'Video': '動画・映像',
  'YouTube': 'YouTube・SNS動画',
  'Documentary': 'ドキュメンタリー',
  'Education': '教育・学習',
  'Educational': '教育・学習',
  'E-Learning': 'eラーニング・研修',
  'Instructional': '操作説明・チュートリアル',
  'Training': '研修・トレーニング',
  'Audiobook': 'オーディオブック',
  'Literature': '文学・小説',
  'Fiction': 'フィクション・小説',
  'Children': '子ども向け',
  'Commercial': 'CM・広告',
  'Advertising': '広告・宣伝',
  'Promotion': '販促・プロモーション',
  'Marketing': 'マーケティング',
  'Sales': '営業・販売',
  'News': 'ニュース・報道',
  'Broadcast': '放送・番組',
  'Announcement': '案内・アナウンス',
  'Public': '公共・イベント',
  'Telephony': '電話案内・ガイダンス',
  'IVR': '自動音声応答 (IVR)',
  'Customer Service': 'カスタマー対応',
  'Meditation': '瞑想・マインドフルネス',
  'Relaxation': 'リラクゼーション',
  'Wellness': 'ヘルスケア・健康',
  'Gaming': 'ゲーム',
  'Entertainment': 'エンタメ・娯楽',
  'Storytelling': 'ストーリー・朗読',
  'Podcast': 'ポッドキャスト・ラジオ',
  'Casual': '日常・カジュアル',
  'Conversation': '会話・対話',
  'Social': 'SNS・日常',
  'Corporate': 'ビジネス・企業向け',
  'Business': 'ビジネス',
  'Healthcare': '医療・ヘルスケア',
  'Travel': '旅行・観光',
  'Tourism': '観光・ガイド',
};

/**
 * 複合的な人物像（例: "Companion & Peer / Digital Assistant (Friend)"）のベース分類辞書
 */
export const PERSONA_BASE_TRANSLATIONS: Record<string, string> = {
  // 対話・アシスタント
  'companion & peer / digital assistant': '対話・AIアシスタント',
  'companion & peer': '対話・相棒',
  'digital assistant': 'AIアシスタント',
  'virtual assistant': 'AIアシスタント',

  // ニュース・ポッドキャスト・司会・放送
  'news & podcast host / podcaster': 'ニュース・ポッドキャスト司会',
  'news & podcast host': 'ニュース・ポッドキャスト司会',
  'podcaster': 'ポッドキャスト司会',
  'podcast host': 'ポッドキャスト司会',
  'broadcaster / entertainer': '放送・エンタメ',
  'broadcaster': '放送アナウンス',
  'entertainer': 'エンタメ司会',

  // 物語・朗読・ナレーション
  'storyteller & narrator': '物語朗読・ナレーション',
  'narrator / storyteller': '朗読・ナレーション',
  'storyteller': '物語朗読',
  'narrator': 'ナレーション',
  'audiobook narrator': 'オーディオブック朗読',

  // 動画・研修・教育・解説
  'video voiceover & host / training voiceover': '動画・研修ナレーション',
  'video voiceover & host': '動画・解説司会',
  'video voiceover': '動画ナレーション',
  'training voiceover': '研修・解説ナレーション',
  'educational tutor': '教育・講師',
  'educational instructor': '教育・講師',
  'corporate trainer': '企業研修講師',

  // コンシェルジュ・秘書・オフィス
  'concierge & ea': 'コンシェルジュ・秘書',
  'concierge & executive assistant': 'コンシェルジュ・役員秘書',
  'concierge': 'コンシェルジュ',
  'ea': '秘書',
  'executive assistant': '役員秘書',

  // テクニカルサポート・技術顧問
  'tech support agent / tech advisor': 'テクニカルサポート・技術顧問',
  'tech support agent': 'テクニカルサポート',
  'tech advisor': '技術顧問',
  'tech support': 'テクニカルサポート',
  'technical support': 'テクニカルサポート',

  // カスタマー窓口・コールセンター
  'customer support / call center agent': 'カスタマー窓口・コールセンター',
  'customer service / call center agent': 'カスタマー窓口・コールセンター',
  'call center agent': 'コールセンター案内',
  'call center': 'コールセンター',
  'customer service / support': 'サポート案内',
  'customer service': 'カスタマー対応',
  'customer support': 'カスタマーサポート',
  'customer support agent': 'カスタマーサポート',

  // 専門家・顧問・アドバイザー
  'high-trust advisor / authoritative advisor': '専門家・顧問',
  'high-trust advisor / authority': '専門家・顧問',
  'high-trust advisor': '専門家・アドバイザー',
  'authoritative advisor': '専門家・顧問',
  'authority': '専門家・顧問',
  'advisor': 'アドバイザー・顧問',
  'consultant': 'コンサルタント',

  // 広告・プロモーション・CM
  'advertising pitch & commerce / commercial voiceover': '広告・セールスCMナレーション',
  'advertising pitch & commerce': '広告・セールス',
  'advertising pitch': '広告セールス',
  'commercial voiceover': 'CMナレーション',
  'commercial & promo': 'CM・プロモーション',
  'commercial / promo': 'CM・プロモーション',
  'commercial / marketing': '広告・プロモーション',
  'commercial announcer': 'CMアナウンス',
  'content creator / influencer': '動画クリエイター',

  // キャラクター・劇・エンタメ
  'character & theatrical': 'キャラクター・演技劇',
  'theatrical': '演劇・ドラマ',
  'game character': 'ゲームキャラクター',
  'entertainment & gaming': 'エンタメ・ゲーム',

  // コーチ・ウェルネス・自己啓発
  'coach / motivational guide': 'コーチ・モチベーション指導',
  'motivational guide': 'モチベーション指導',
  'coach': 'コーチ',
  'wellness & culture guide': 'ウェルネス・文化教養',
  'wellness & culture': 'ウェルネス・文化教養',
};

/**
 * 括弧内の具体的な役割・トーンの辞書
 */
export const PERSONA_ROLE_TRANSLATIONS: Record<string, string> = {
  // コンシェルジュ・秘書・イベント・観光
  'event planner': 'イベント企画',
  'executive assistant': '役員秘書',
  'hotel concierge': 'ホテルコンシェルジュ',
  'tour guide': '観光ガイド',
  'receptionist': '受付担当',
  'coordinator': 'コーディネーター',

  // テクニカル・IT・専門職
  'architect': '設計士・アーキテクト',
  'grandparent': '祖父母・シニア',
  'grandfather': '祖父・シニア',
  'grandmother': '祖母・シニア',
  'librarian': '司書・案内人',
  'engineer': 'エンジニア・技術者',
  'technician': '技術担当',
  'researcher': '研究員・リサーチャー',
  'scientist': '科学者',
  'analyst': '分析官・アナリスト',
  'it specialist': 'IT専門員',
  'help desk': 'ヘルプデスク',

  // サポート・営業・福祉
  'customer service agent': '案内担当',
  'customer service': 'カスタマー窓口',
  'sales associate': '販売・営業',
  'social worker': 'ソーシャルワーカー',
  'caregiver': '介護士・ケアスタッフ',
  'counselor': 'カウンセラー・相談員',

  // 士業・医療・金融
  'doctor': '医師',
  'physician': '医師',
  'lawyer': '弁護士',
  'attorney': '弁護士',
  'financial advisor': '金融アドバイザー',
  'accountant': '会計士',
  'consultant': 'コンサルタント',
  'fashion consultant': 'ファッションコンサルタント',
  'chess instructor': 'チェス講師',
  'political activist': '社会活動家',

  // コーチ・ウェルネス・案内
  'lifestyle coach': 'ライフスタイルコーチ',
  'life coach': 'ライフコーチ',
  'mindfulness coach': 'マインドフルネスコーチ',
  'fitness coach': 'フィットネスコーチ',
  'personal trainer': 'パーソナルトレーナー',
  'nutritionist': '栄養士',
  'motivational guide': 'モチベーション指導',
  'person giving driving directions': '道案内・ナビゲーション',
  'driving directions': '道案内・ナビゲーション',

  // 動画・メディア・司会・演出
  'nature documentary narrator': '自然ドキュメンタリー',
  'documentary narrator': 'ドキュメンタリー朗読',
  'documentary': 'ドキュメンタリー',
  'philosopher': '哲学者・思想家',
  'cooking show host': '料理番組司会',
  'instructional video host': '操作説明司会',
  'instructional': '操作説明',
  'trivia host': 'クイズ番組司会',
  'podcast interviewer': 'ポッドキャスト取材',
  'podcast host': 'ポッドキャスト司会',
  'radio host': 'ラジオ司会',
  'news anchor': 'ニュースキャスター',
  'news reporter': 'ニュースリポーター',
  'sports commentator': 'スポーツ解説',

  // 教育・講師・指導
  'professor': '大学教授',
  'teacher': '教師',
  'writing tutor': '文章指導',
  'math tutor': '数学講師',
  'science tutor': '科学講師',
  'tutor': '講師・家庭教師',
  'academic': '研究者',
  'expert': '専門家',
  'trainer': 'トレーナー',
  'coach': 'コーチ',
  'instructor': 'インストラクター',
  'mentor': '指導者・メンター',
  'student': '学生・生徒',

  // 対話・日常・家族・友人
  'best friend': '親友',
  'friend': '友人',
  'parent': '親・保護者',
  'sibling': '兄弟・姉妹',
  'companion': '仲間・相棒',
  'partner': 'パートナー',
  'assistant': 'アシスタント',
  'youth': '若者・青年',
  'teenager': 'ティーンエイジャー',
  'child': '子ども',

  // ビジネス・広告・案内
  'influencer': 'インフルエンサー',
  'brand ambassador': 'ブランドアンバサダー',
  'product reviewer': '製品レビュアー',
  'auctioneer': '競売人・オークショニア',
  'real estate agent': '不動産エージェント',
  'car dealer': 'カーディーラー',
  'museum guide': '博物館案内',
  'salesperson': '営業・販売',
  'marketer': 'マーケター',
  'interviewer': 'インタビュアー',

  // 朗読・ストーリー・ファンタジー
  'storyteller': '物語の語り手',
  'audiobook': 'オーディオブック',
  'poet': '詩人',
  'actor': '声優・俳優',
  'detective': '探偵',
  'wizard': '魔法使い',
  'warrior': '戦士',
  'knight': '騎士',
  'robot': 'ロボット',
};

/**
 * 未知の単語や派生語が出現した場合のフォールバック単語辞書
 */
export const PERSONA_WORD_TRANSLATIONS: Record<string, string> = {
  // コンシェルジュ・秘書
  concierge: 'コンシェルジュ',
  ea: '秘書',
  executive: '役員',
  assistant: '秘書・アシスタント',
  planner: '企画',
  event: 'イベント',
  hotel: 'ホテル',
  tour: '観光',
  guide: '案内',

  // 技術・IT・専門職
  tech: '技術',
  support: 'サポート',
  agent: '担当',
  advisor: '顧問',
  authoritative: '専門家',
  authority: '専門家',
  architect: '設計士',
  grandparent: 'シニア',
  librarian: '司書',
  engineer: '技術者',
  technician: '技術員',
  researcher: '研究員',
  scientist: '科学者',
  analyst: '分析官',
  specialist: '専門員',

  // サポート・窓口
  customer: 'カスタマー',
  service: '窓口',
  call: 'コール',
  center: 'センター',
  sales: '営業・販売',
  associate: '担当',
  social: 'ソーシャル',
  worker: '支援員',

  // 専門・医療・法律・教育
  doctor: '医師',
  lawyer: '弁護士',
  financial: '金融',
  consultant: 'コンサルタント',
  professor: '教授',
  teacher: '教師',
  instructor: '講師',
  tutor: '講師',
  mentor: '指導者',
  trainer: 'トレーナー',
  coach: 'コーチ',

  // 広告・ビジネス・メディア
  advertising: '広告',
  pitch: 'セールス',
  commerce: 'コマース',
  commercial: 'CM',
  voiceover: 'ナレーション',
  marketing: 'マーケティング',
  promo: 'プロモーション',
  influencer: 'インフルエンサー',
  fashion: 'ファッション',
  chess: 'チェス',
  political: '社会',
  activist: '活動家',
  ambassador: 'アンバサダー',
  reviewer: 'レビュアー',
  dealer: 'ディーラー',
  auctioneer: '競売人',

  // コーチ・ウェルネス・案内
  lifestyle: 'ライフスタイル',
  motivational: '指導',
  mindfulness: 'マインドフルネス',
  meditation: '瞑想',
  wellness: 'ウェルネス',
  fitness: 'フィットネス',
  nutrition: '栄養',
  nutritionist: '栄養士',
  personal: '専属',
  person: '担当',
  giving: '案内',
  driving: '運転',
  directions: '案内',
  direction: '案内',

  // キャラクター・劇・その他
  character: 'キャラクター',
  theatrical: '演技劇',
  story: '物語',
  storyteller: '語り手',
  narrator: 'ナレーター',
  hero: '主人公',
  villain: '悪役',
  detective: '探偵',
  wizard: '魔法使い',
  warrior: '戦士',
  knight: '騎士',
  robot: 'ロボット',
  actor: '俳優',
  poet: '詩人',
};

/**
 * 日本語文字列が含まれているかを判定（すでに日本語の場合は二重付与しない）
 */
function containsJapanese(str: string): boolean {
  return /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf]/.test(str);
}

/**
 * 単独パーツ（英単語または複合語）を日本語に翻訳するヘルパー
 */
function translatePart(part: string): string {
  const trimmed = part.trim();
  if (!trimmed) return '';
  if (containsJapanese(trimmed)) return trimmed;

  const lower = trimmed.toLowerCase();
  if (PERSONA_BASE_TRANSLATIONS[lower]) return PERSONA_BASE_TRANSLATIONS[lower];
  if (PERSONA_ROLE_TRANSLATIONS[lower]) return PERSONA_ROLE_TRANSLATIONS[lower];
  if (VOICE_PERSONA_TRANSLATIONS[trimmed]) return VOICE_PERSONA_TRANSLATIONS[trimmed];

  for (const [key, val] of Object.entries(VOICE_PERSONA_TRANSLATIONS)) {
    if (key.toLowerCase() === lower) return val;
  }

  // 単語単位でのフォールバック
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    const translatedWords = words.map((w) => {
      const wClean = w.toLowerCase().replace(/[^a-z0-9]/g, '');
      return PERSONA_WORD_TRANSLATIONS[wClean] || w;
    });
    if (translatedWords.some(containsJapanese)) {
      if (translatedWords.every(containsJapanese)) {
        return translatedWords.join('');
      } else {
        return translatedWords.join(' ');
      }
    }
  }

  return trimmed;
}

/**
 * 複合ベースカテゴリのスラッシュや記号を分解して日本語訳を合成するヘルパー
 */
function translateCompositeBase(baseRaw: string): string {
  const trimmed = baseRaw.trim();
  const lowerAll = trimmed.toLowerCase();
  if (PERSONA_BASE_TRANSLATIONS[lowerAll]) {
    return PERSONA_BASE_TRANSLATIONS[lowerAll];
  }
  if (VOICE_PERSONA_TRANSLATIONS[trimmed]) {
    return VOICE_PERSONA_TRANSLATIONS[trimmed];
  }

  // まずスラッシュ '/' で大きく区切る（例: "Advertising Pitch & Commerce / Commercial Voiceover"）
  const slashParts = trimmed.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
  if (slashParts.length > 1) {
    const translatedSlash = slashParts.map((sp) => {
      const spLower = sp.toLowerCase();
      if (PERSONA_BASE_TRANSLATIONS[spLower]) return PERSONA_BASE_TRANSLATIONS[spLower];
      return translatePart(sp);
    });
    if (translatedSlash.some(containsJapanese)) {
      const uniqueParts = [...new Set(translatedSlash)];
      return uniqueParts.join('・');
    }
  }

  const parts = trimmed.split(/\s*[/&]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    const translatedParts = parts.map((part) => translatePart(part));
    if (translatedParts.some(containsJapanese)) {
      // 重複する翻訳（例: 「専門家・顧問」が複数回結合されるなど）を排除
      const uniqueParts = [...new Set(translatedParts)];
      return uniqueParts.join('・');
    }
  }
  return translatePart(trimmed);
}

/**
 * 職業・人物像（persona）を「日本語訳 (英語)」形式でフォーマットする。
 * 辞書にない場合でも英語の重複を防ぎ、自然な日本語と英語を提示する。
 * パイプ `|` で複数カテゴリが連結されている場合は主要カテゴリを取り出して処理する。
 */
export function formatPersonaLabel(persona: string): string {
  const trimmed = persona.trim();
  if (!trimmed) return '';
  if (containsJapanese(trimmed)) return trimmed;

  // 1. パイプ '|' による連結がある場合（例: "Video Voiceover ... (Trivia Host) | News ... (Trivia Host)"）
  // ドロップダウンで視認しやすいよう先頭の主セグメントを対象にする
  let primaryTarget = trimmed;
  if (trimmed.includes('|')) {
    const segments = trimmed.split('|').map((s) => s.trim()).filter(Boolean);
    if (segments.length > 0) {
      primaryTarget = segments[0];
    }
  }

  // 2. 単独完全一致（辞書にある場合）
  const primaryLower = primaryTarget.toLowerCase();
  if (VOICE_PERSONA_TRANSLATIONS[primaryTarget]) {
    const ja = VOICE_PERSONA_TRANSLATIONS[primaryTarget];
    return `${ja} (${primaryTarget})`;
  }
  if (PERSONA_BASE_TRANSLATIONS[primaryLower]) {
    const ja = PERSONA_BASE_TRANSLATIONS[primaryLower];
    return `${ja} (${primaryTarget})`;
  }

  // 3. 複合形式 "BaseCategory (Role)" のパース
  const match = primaryTarget.match(/^(.*?)\s*\((.*?)\)$/);
  if (match) {
    const baseRaw = match[1].trim();
    const roleRaw = match[2].trim();
    const baseLower = baseRaw.toLowerCase();
    const roleLower = roleRaw.toLowerCase();

    const baseJa =
      PERSONA_BASE_TRANSLATIONS[baseLower] ||
      VOICE_PERSONA_TRANSLATIONS[baseRaw] ||
      translateCompositeBase(baseRaw);

    const roleJa =
      PERSONA_ROLE_TRANSLATIONS[roleLower] ||
      VOICE_PERSONA_TRANSLATIONS[roleRaw] ||
      translatePart(roleRaw);

    // roleJa が日本語訳されている場合は "BaseJa: RoleJa (RoleRaw)"
    // roleJa が英語のまま（未知）の場合は英語重複を防ぎ "BaseJa: RoleRaw"
    if (roleJa !== roleRaw && containsJapanese(roleJa)) {
      return `${baseJa}: ${roleJa} (${roleRaw})`;
    } else {
      return `${baseJa}: ${roleRaw}`;
    }
  }

  // 4. 大文字小文字やスペース揺れを吸収
  for (const [key, ja] of Object.entries(VOICE_PERSONA_TRANSLATIONS)) {
    if (key.toLowerCase() === primaryLower) {
      return `${ja} (${primaryTarget})`;
    }
  }

  // 5. 単独で複合語（スラッシュや&が含まれる）の場合のフォールバック
  if (primaryTarget.includes('/') || primaryTarget.includes('&')) {
    const translatedComposite = translateCompositeBase(primaryTarget);
    if (containsJapanese(translatedComposite)) {
      return `${translatedComposite} (${primaryTarget})`;
    }
  }

  return primaryTarget;
}

/**
 * シーン・用途（context）を「日本語訳 (英語)」形式でフォーマットする。
 * 辞書にない場合は英語そのまま、すでに日本語の場合はそのまま返す。
 */
export function formatContextLabel(context: string): string {
  const trimmed = context.trim();
  if (!trimmed) return '';
  if (containsJapanese(trimmed)) return trimmed;

  if (VOICE_CONTEXT_TRANSLATIONS[trimmed]) {
    const ja = VOICE_CONTEXT_TRANSLATIONS[trimmed];
    return `${ja} (${trimmed})`;
  }

  // 大文字小文字やスペース揺れを吸収
  const lower = trimmed.toLowerCase();
  for (const [key, ja] of Object.entries(VOICE_CONTEXT_TRANSLATIONS)) {
    if (key.toLowerCase() === lower) {
      return `${ja} (${trimmed})`;
    }
  }

  return trimmed;
}

/**
 * 音声が指定された用途グループにマッチするか判定する（互換用）。
 */
export function voiceMatchesPurposeGroup(voice: Gemini38Voice, group: VoicePurposeGroup): boolean {
  if (group === 'all') return true;

  const targetText = `${voice.persona} ${voice.context} ${voice.description} ${voice.label}`.toLowerCase();

  switch (group) {
    case 'narration':
      return /video|narrat|documentary|explainer|teach|educat|instruct|corporate|e-learning|presenter|profess|academic|technical|content/i.test(targetText);
    case 'storytelling':
      return /story|audiobook|fiction|book|tale|bedtime|poet|drama|literature/i.test(targetText);
    case 'commercial':
      return /commercial|advertis|promo|market|sales|pitch|infomercial|growth/i.test(targetText);
    case 'character':
      return /casual|conversat|assistant|game|gaming|companion|character|hero|villain|youth|friend|sidekick|entertainment/i.test(targetText);
    case 'announcement':
      return /news|anchor|reporter|journalist|public|broadcast|ivr|phone|operator|tour|museum|meditation|wellness|customer|enterprise/i.test(targetText);
    default:
      return true;
  }
}

/**
 * 与えられた音声リストから、現在の条件内で利用可能な context（用途・目的）の
 * 一覧（値、日本語併記ラベル、該当件数）を抽出・ソートして返す。
 */
export function getContextSelectOptions(
  voices: Gemini38Voice[],
  language: 'ja' | 'en',
  genderOrGroup: string = 'all',
  selectedPersona: string = '',
): Array<{ value: string; label: string; count: number }> {
  const languageFiltered = voices.filter((v) => v.languageCode.toLowerCase().startsWith(language));
  
  // genderOrGroup が性別（'all', 'female', 'male', 'neutral'）または用途グループ（'narration' など）のどちらにも対応
  const genderFiltered = ['female', 'male', 'neutral'].includes(genderOrGroup)
    ? languageFiltered.filter((v) => v.gender === genderOrGroup)
    : genderOrGroup !== 'all' && ['narration', 'storytelling', 'commercial', 'character', 'announcement'].includes(genderOrGroup)
      ? languageFiltered.filter((v) => voiceMatchesPurposeGroup(v, genderOrGroup as VoicePurposeGroup))
      : languageFiltered;

  const personaFiltered = selectedPersona
    ? genderFiltered.filter((v) => v.persona.trim() === selectedPersona.trim())
    : genderFiltered;

  const countMap = new Map<string, number>();
  for (const voice of personaFiltered) {
    const c = voice.context.trim();
    if (c) {
      countMap.set(c, (countMap.get(c) ?? 0) + 1);
    }
  }

  return [...countMap.entries()]
    .map(([value, count]) => ({
      value,
      label: formatContextLabel(value),
      count,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ja'));
}

/**
 * 与えられた音声リストから、現在の条件内で利用可能な persona（職業・人物像）の
 * 一覧（値、日本語併記ラベル、該当件数）を抽出・ソートして返す。
 */
export function getPersonaSelectOptions(
  voices: Gemini38Voice[],
  language: 'ja' | 'en',
  genderOrGroup: string = 'all',
  selectedContext: string = '',
): Array<{ value: string; label: string; count: number }> {
  const languageFiltered = voices.filter((v) => v.languageCode.toLowerCase().startsWith(language));

  const genderFiltered = ['female', 'male', 'neutral'].includes(genderOrGroup)
    ? languageFiltered.filter((v) => v.gender === genderOrGroup)
    : genderOrGroup !== 'all' && ['narration', 'storytelling', 'commercial', 'character', 'announcement'].includes(genderOrGroup)
      ? languageFiltered.filter((v) => voiceMatchesPurposeGroup(v, genderOrGroup as VoicePurposeGroup))
      : languageFiltered;

  const contextFiltered = selectedContext
    ? genderFiltered.filter((v) => v.context.trim() === selectedContext.trim())
    : genderFiltered;

  const countMap = new Map<string, number>();
  for (const voice of contextFiltered) {
    const p = voice.persona.trim();
    if (p) {
      countMap.set(p, (countMap.get(p) ?? 0) + 1);
    }
  }

  return [...countMap.entries()]
    .map(([value, count]) => ({
      value,
      label: formatPersonaLabel(value),
      count,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ja'));
}
