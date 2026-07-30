/**
 * @file narrationDelivery.ts
 * @description AIナレーションの「場面（全体）」と「原稿内の語り口調」を扱う純ロジック。
 *
 * 方針:
 * - 原稿は単一テキストのまま編集する（入力欄を分割しない）
 * - UI 上の語り口調は可視マーカー《語り口》…《/》で指定する
 * - TTS プロンプトは公式例に合わせる:
 *     Scene / Sample Context / [short-tag] 本文 [short-tag] 本文 ...
 *     タグは 1 語中心の英語（informative / bright / comical 等）。長文はタグに入れない
 * - キャプション生成など「読む本文」はマーカー除去後の平文を使う
 *
 * @see https://ai.google.dev/gemini-api/docs/speech-generation
 * @see https://aistudio.google.com/generate-speech
 */

/**
 * ナレーション全体の場面プリセット。
 * UI 用の日本語説明と、TTS 向け英語の Scene / Director's Notes を持つ。
 */
export const NARRATION_SCENE_PRESETS = [
  {
    id: 'none',
    label: '指定なし',
    scene: '',
    sampleContext: '',
    sceneEn: '',
    styleEn: '',
    pacingEn: '',
  },
  {
    id: 'studio',
    label: 'スタジオ解説',
    scene: '静かなスタジオ。',
    sampleContext:
      '操作方法を説明するe-learning調。落ち着いたペースで、分かりやすい間を取りながら話す。口調ははっきりしていて親しみやすい。',
    sceneEn:
      'A quiet corporate recording studio. Soft room tone, clear mic presence, instructional e-learning vibe.',
    styleEn:
      'Clear, friendly instructor. Articulate consonants, warm but professional. Easy to follow for learners.',
    pacingEn:
      'Measured pacing with short, natural pauses after key steps. Never rushed.',
  },
  {
    id: 'product',
    label: '商品紹介',
    scene: '商品紹介の撮影現場。',
    sampleContext:
      '親しみやすく商品やサービスを紹介する。明るく聞き取りやすいペース。口調はフレンドリーで分かりやすい。',
    sceneEn:
      'A bright product showcase set. Friendly commercial voiceover for a short product video.',
    styleEn:
      'Warm, inviting, and persuasive product host. Vocal smile; make features sound appealing without hard-sell shouting.',
    pacingEn:
      'Lively but clear mid-tempo. Slight lift on benefit phrases.',
  },
  {
    id: 'story',
    label: '物語調',
    scene: '物語を語る静かな空間。',
    sampleContext:
      '物語を語るように情景が伝わる話し方。緩急をつけ、聞き手が映像を思い浮かべられるトーン。',
    sceneEn:
      'A quiet storytelling space. Intimate narration as if painting a scene for the listener.',
    styleEn:
      'Storyteller energy. Evocative, cinematic, with gentle dynamic variation so imagery comes through.',
    pacingEn:
      'Flexible pacing: slower on imagery, a touch faster on action beats. Natural breath pauses.',
  },
  {
    id: 'news',
    label: 'ニュース調',
    scene: 'ニューススタジオ。',
    sampleContext:
      'ニュース番組のように落ち着いて正確に伝える。測定されたペースと明瞭な発音。権威がありつつアクセスしやすい口調。',
    sceneEn:
      'A TV news studio. Authoritative broadcast desk, clean and professional delivery.',
    styleEn:
      'Broadcast news anchor: composed, precise, credible, still accessible—not stiff.',
    pacingEn:
      'Steady measured news pacing. Even rhythm, crisp articulation, minimal filler.',
  },
] as const;

export type NarrationScenePresetId = (typeof NARRATION_SCENE_PRESETS)[number]['id'];

/** 保存用: Scene + Sample Context */
export interface NarrationSceneSetting {
  scene: string;
  sampleContext: string;
}

/**
 * 区間ごとの語り口調プリセット（少数）。
 * - label: UI / 原稿マーカー用（日本語）
 * - tag: TTS 用の短い英語 audio tag（公式例どおり 1 語中心）
 *
 * 公式例:
 *   [informative] Welcome... [instruction] In this section... [reminder] Before we begin...
 * 長文の演技指示はタグに書かず、Scene / Sample Context 側へ載せる。
 */
export const NARRATION_TONE_PRESETS = [
  { id: 'bright', label: '明るく', tag: 'bright' },
  { id: 'calm', label: '落ち着いて', tag: 'calm' },
  { id: 'clear', label: 'はっきり', tag: 'clear' },
  { id: 'soft', label: 'やわらかく', tag: 'soft' },
  { id: 'emphasize', label: '強調して', tag: 'emphasize' },
] as const;

export type NarrationTonePresetId = (typeof NARRATION_TONE_PRESETS)[number]['id'];

/** 閉じマーカー */
export const DELIVERY_CLOSE_MARKER = '《/》';

/** 開きマーカーの正規表現。《明るく》または旧《:自由入力》 */
const OPEN_MARKER_RE = /《([^》]+)》/g;

/**
 * 日本語の自由入力語り口 → 短い英語 audio tag。
 * 公式: 非英語原稿でも英語タグ推奨。タグは 1 語中心（informative / instruction 等）。
 */
const JA_TONE_TO_ENGLISH: ReadonlyArray<{ pattern: RegExp; tag: string }> = [
  { pattern: /コミカル|滑稽|おどけ|ふざけ|冗談|ユーモア|ギャグ|お笑い/, tag: 'comical' },
  { pattern: /ささや|囁|ウィスパー|ひそひそ|内緒|秘密|こっそり/, tag: 'whispers' },
  { pattern: /叫|シャウト|怒鳴|大声/, tag: 'shouting' },
  { pattern: /強調|力を込め|力強く|アピール/, tag: 'emphasize' },
  { pattern: /興奮|わくわく|ワクワク|テンション高|ハイテンション|胸躍/, tag: 'excited' },
  { pattern: /楽しく|楽しげ|陽気|にこやか|笑顔|ハッピー|cheer/, tag: 'cheerful' },
  { pattern: /明るく|明るい|元気|弾む|弾んだ/, tag: 'bright' },
  { pattern: /落ち着|穏やか|ゆったり|のんびり|リラックス|静か[くに]/, tag: 'calm' },
  { pattern: /やわらか|柔らか|優しく|やさしく|温かく|あたたかく|柔らかめ/, tag: 'soft' },
  { pattern: /はっきり|明瞭|クリア|くっきり|聞き取りやすく/, tag: 'clear' },
  { pattern: /真剣|シリアス|真面目|厳粛|重々しく/, tag: 'serious' },
  { pattern: /悲し|しんみり|切な|憂い/, tag: 'sad' },
  { pattern: /泣き|すすり泣/, tag: 'crying' },
  { pattern: /怒[っり]|イライラ|憤|むかつ/, tag: 'angry' },
  { pattern: /怖[いく]|ホラー|不気味|ゾッ|恐ろし/, tag: 'spooky' },
  { pattern: /早[くめ]|スピーディ|テンポよく|早口|急いで/, tag: 'fast' },
  { pattern: /遅[くめ]|ゆっくり|スロー/, tag: 'slow' },
  { pattern: /皮肉|サカスティック|からか|冷やか/, tag: 'sarcastic' },
  { pattern: /疲[れれ]|ダル|退屈|つまん|つまら/, tag: 'tired' },
  { pattern: /驚[きき]|びっくり|仰天|amazed/, tag: 'amazed' },
  { pattern: /笑[いい]|くすくす|クスクス/, tag: 'giggles' },
  { pattern: /ためらい|しぶしぶ|嫌々|気が進ま/, tag: 'reluctant' },
  { pattern: /パニック|慌て|あわて|焦[っり]/, tag: 'panicked' },
  { pattern: /悪戯|いたずら|ニヤリ/, tag: 'mischievous' },
  { pattern: /説明|解説|インストラクション/, tag: 'instruction' },
  { pattern: /注意|リマインド|お知らせ/, tag: 'reminder' },
  { pattern: /情報|インフォ|お伝え/, tag: 'informative' },
  { pattern: /緊迫|緊張|ピンチ|サスペンス/, tag: 'tense' },
  { pattern: /情熱|熱く|熱意|情熱的/, tag: 'passionate' },
  { pattern: /冷静|クール|淡々/, tag: 'cool' },
];

export interface DeliverySegment {
  /** 読み上げる本文（マーカーなし） */
  text: string;
  /**
   * TTS 用の英語 audio tag（例: excitedly / whispers）。
   * null ならタグなし。
   */
  toneTag: string | null;
  /** UI 表示用ラベル（プリセット名 or 自由入力） */
  toneLabel: string | null;
  /** 原稿上の開始オフセット（マーカー含む区間の先頭） */
  rangeStart: number;
  /** 原稿上の終了オフセット（排他） */
  rangeEnd: number;
  /** 本文だけの開始オフセット（マーカー直後） */
  contentStart: number;
  /** 本文だけの終了オフセット（閉じマーカー直前、未閉じなら末尾） */
  contentEnd: number;
}

export interface WrapToneResult {
  text: string;
  /** 操作後にキャレットを置く位置 */
  caret: number;
}

const clampRange = (start: number, end: number, length: number) => {
  const a = Math.max(0, Math.min(length, Math.min(start, end)));
  const b = Math.max(0, Math.min(length, Math.max(start, end)));
  return { start: a, end: b };
};

/** マーカー本文から先頭の旧互換コロンを除去 */
export function stripLegacyCustomPrefix(body: string): string {
  const raw = body.trim();
  if (raw.startsWith(':')) {
    return raw.slice(1).trim() || raw;
  }
  return raw;
}

/** プリセットラベル or 自由入力から開きマーカー文字列を作る（コロンは付けない） */
export function buildOpenMarker(toneLabel: string): string {
  const label = toneLabel.trim();
  if (!label) return '';
  // 中に》や改行が来ないよう除去。カスタムもプリセットも同じ《…》形式
  const safe = label.replace(/[》\n\r]/g, '').trim();
  if (!safe) return '';
  return `《${safe}》`;
}

/**
 * 自由入力・日本語ラベルを短い英語 audio tag へ変換する。
 * 公式: non-English transcript でも English tags。タグは短く（informative 等）。
 */
export function toEnglishAudioTag(label: string): string {
  const raw = stripLegacyCustomPrefix(label).trim();
  if (!raw) return 'style';

  // 既に英語中心なら短いトークンへ
  if (isMostlyAscii(raw)) {
    return sanitizeTtsTag(raw);
  }

  // キーワード対応（先勝ち・1 語のみ）
  for (const entry of JA_TONE_TO_ENGLISH) {
    if (entry.pattern.test(raw)) {
      return entry.tag;
    }
  }

  // 未知の日本語は汎用タグ（長文をタグに埋め込まない）
  return 'expressive';
}

function isMostlyAscii(value: string): boolean {
  const ascii = value.replace(/[^A-Za-z0-9]/g, '');
  const letters = value.replace(/[^A-Za-z0-9\u3040-\u30ff\u3400-\u9fff]/g, '');
  if (!letters) return true;
  return ascii.length / Math.max(1, letters.length) >= 0.6;
}

/**
 * マーカー内の表記から TTS タグを解決。
 * プリセット・自由入力とも短い英語 tag。旧《:カスタム》も読み取り互換。
 */
export function resolveToneTagFromMarkerBody(body: string): {
  label: string;
  tag: string;
} {
  const raw = stripLegacyCustomPrefix(body);
  if (!raw) {
    return { label: body.trim() || 'style', tag: 'style' };
  }

  const preset = NARRATION_TONE_PRESETS.find(
    (p) => p.label === raw || p.tag === raw || p.id === raw,
  );
  if (preset) {
    return { label: preset.label, tag: preset.tag };
  }

  return { label: raw, tag: toEnglishAudioTag(raw) };
}

/**
 * TTS 角括弧タグ用に短いトークンへ寄せる。
 * 公式例: [informative] / [instruction] / [whispers] / [excited]
 * 長文の演技指示はタグに入れない（Sample Context 側へ）。
 */
export function sanitizeTtsTag(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'style';

  let cleaned = trimmed
    .replace(/[\[\]《》]/g, '')
    .replace(/[\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.startsWith(':')) {
    cleaned = cleaned.slice(1).trim();
  }
  if (!cleaned) return 'style';

  // 英単語中心なら先頭 1〜2 語（公式の短いタグ）
  const asciiWords = cleaned
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_]/g, ' ')
    .trim()
    .split(/[\s_\-]+/)
    .filter(Boolean);
  if (asciiWords.length > 0) {
    return asciiWords.slice(0, 2).join('-').slice(0, 32);
  }

  return cleaned.slice(0, 24);
}

/**
 * 原稿内の語り口調マーカーを解析する。
 * ネストはサポートしない（後勝ちで閉じる）。
 */
export function parseDeliveryMarkup(script: string): DeliverySegment[] {
  const source = script ?? '';
  const segments: DeliverySegment[] = [];
  let lastIndex = 0;
  let pending: {
    label: string;
    tag: string;
    openStart: number;
    contentStart: number;
  } | null = null;

  OPEN_MARKER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = OPEN_MARKER_RE.exec(source)) !== null) {
    const full = match[0];
    const body = match[1] ?? '';
    const matchStart = match.index;
    const matchEnd = matchStart + full.length;

    // 閉じマーカー
    if (full === DELIVERY_CLOSE_MARKER || body === '/') {
      if (pending) {
        const inner = source.slice(pending.contentStart, matchStart);
        if (inner.length > 0) {
          segments.push({
            text: inner,
            toneTag: pending.tag,
            toneLabel: pending.label,
            rangeStart: pending.openStart,
            rangeEnd: matchEnd,
            contentStart: pending.contentStart,
            contentEnd: matchStart,
          });
        }
        pending = null;
      }
      lastIndex = matchEnd;
      continue;
    }

    // 開きマーカーの前の平文
    if (matchStart > lastIndex) {
      const plain = source.slice(lastIndex, matchStart);
      if (plain.length > 0) {
        if (pending) {
          // 未閉じのまま次の開きに当たった場合は、ここまでを pending トーンとして確定
          segments.push({
            text: plain,
            toneTag: pending.tag,
            toneLabel: pending.label,
            rangeStart: pending.openStart,
            rangeEnd: matchStart,
            contentStart: pending.contentStart,
            contentEnd: matchStart,
          });
          pending = null;
        } else {
          segments.push({
            text: plain,
            toneTag: null,
            toneLabel: null,
            rangeStart: lastIndex,
            rangeEnd: matchStart,
            contentStart: lastIndex,
            contentEnd: matchStart,
          });
        }
      }
    }

    const resolved = resolveToneTagFromMarkerBody(body);
    pending = {
      label: resolved.label,
      tag: resolved.tag,
      openStart: matchStart,
      contentStart: matchEnd,
    };
    lastIndex = matchEnd;
  }

  if (lastIndex < source.length) {
    const rest = source.slice(lastIndex);
    if (rest.length > 0) {
      if (pending) {
        segments.push({
          text: rest,
          toneTag: pending.tag,
          toneLabel: pending.label,
          rangeStart: pending.openStart,
          rangeEnd: source.length,
          contentStart: pending.contentStart,
          contentEnd: source.length,
        });
      } else {
        segments.push({
          text: rest,
          toneTag: null,
          toneLabel: null,
          rangeStart: lastIndex,
          rangeEnd: source.length,
          contentStart: lastIndex,
          contentEnd: source.length,
        });
      }
    }
  }

  return segments.filter((s) => s.text.length > 0);
}

/** 語り口調マーカーを除いた平文（キャプション生成・表示用） */
export function stripDeliveryMarkers(script: string): string {
  return parseDeliveryMarkup(script)
    .map((s) => s.text)
    .join('');
}

/** 適用中の語り口調ラベル一覧（重複除去・出現順） */
export function listAppliedToneLabels(script: string): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const seg of parseDeliveryMarkup(script)) {
    if (!seg.toneLabel) continue;
    if (seen.has(seg.toneLabel)) continue;
    seen.add(seg.toneLabel);
    labels.push(seg.toneLabel);
  }
  return labels;
}

/**
 * 選択（またはキャレット）が触れている語り口調つき区間の [rangeStart, rangeEnd) を求める。
 * なければ null。
 */
export function findTouchedMarkedRange(
  script: string,
  selectionStart: number,
  selectionEnd: number,
): { start: number; end: number } | null {
  const source = script ?? '';
  const { start, end } = clampRange(selectionStart, selectionEnd, source.length);
  const marked = parseDeliveryMarkup(source).filter((s) => s.toneTag != null);
  if (marked.length === 0) return null;

  // 触れている（重なる）区間をすべて包含する範囲
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const seg of marked) {
    const overlaps =
      start === end
        ? start > seg.rangeStart && start < seg.rangeEnd // キャレットは区間内
        : start < seg.rangeEnd && end > seg.rangeStart;
    if (overlaps) {
      min = Math.min(min, seg.rangeStart);
      max = Math.max(max, seg.rangeEnd);
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return null;
  return { start: min, end: max };
}

/**
 * 選択範囲へ語り口調マーカーを付ける。
 * 範囲が空なら変更なし。既存の《…》《/》を含む範囲は一度平文化してから包む。
 */
export function wrapRangeWithTone(
  script: string,
  selectionStart: number,
  selectionEnd: number,
  toneLabel: string,
): WrapToneResult {
  const source = script ?? '';
  const { start, end } = clampRange(selectionStart, selectionEnd, source.length);
  if (start === end) {
    return { text: source, caret: end };
  }

  const open = buildOpenMarker(toneLabel);
  if (!open) {
    return { text: source, caret: end };
  }

  const selected = source.slice(start, end);
  // 選択内のマーカーは外してから包む（二重マーカー防止）
  const plainSelected = stripDeliveryMarkers(selected);
  if (!plainSelected) {
    return { text: source, caret: end };
  }

  const next =
    source.slice(0, start) + open + plainSelected + DELIVERY_CLOSE_MARKER + source.slice(end);
  const caret = start + open.length + plainSelected.length + DELIVERY_CLOSE_MARKER.length;
  return { text: next, caret };
}

/**
 * 選択範囲（またはキャレット位置の語り口調区間）からマーカーを外す。
 * - 範囲選択: 選択と重なる語り口調区間をまとめて外す。重なりがなければ選択内のマーカーのみ除去
 * - キャレットのみ: その位置を含む語り口調区間を外す。無ければ変更なし
 */
export function unwrapRangeTone(
  script: string,
  selectionStart: number,
  selectionEnd: number,
): WrapToneResult {
  const source = script ?? '';
  const { start, end } = clampRange(selectionStart, selectionEnd, source.length);
  const touched = findTouchedMarkedRange(source, start, end);

  if (touched) {
    const plain = stripDeliveryMarkers(source.slice(touched.start, touched.end));
    const next = source.slice(0, touched.start) + plain + source.slice(touched.end);
    return { text: next, caret: touched.start + plain.length };
  }

  if (start === end) {
    return { text: source, caret: start };
  }

  const selected = source.slice(start, end);
  const plainSelected = stripDeliveryMarkers(selected);
  if (plainSelected === selected) {
    return { text: source, caret: end };
  }
  const next = source.slice(0, start) + plainSelected + source.slice(end);
  return { text: next, caret: start + plainSelected.length };
}

/** 原稿から語り口調マーカーをすべて外す */
export function clearAllDeliveryMarkers(script: string): string {
  return stripDeliveryMarkers(script);
}

/**
 * 公式例どおりの短い [tag] 本文をインラインで組み立てる。
 *
 * 例（公式）:
 *   [informative] Welcome to Module Three... [instruction] In this section...
 */
export function buildTaggedNarrationBody(script: string): string {
  const segments = parseDeliveryMarkup(script);
  let body = '';
  for (const seg of segments) {
    const text = seg.text;
    if (!text) continue;
    if (seg.toneTag) {
      if (body.length > 0 && !/\s$/.test(body)) {
        body += ' ';
      }
      body += `[${seg.toneTag}] ${text.replace(/^\s+/, '')}`;
    } else {
      body += text;
    }
  }
  return body.trim();
}

/** 場面設定を保存用文字列へ（JSON。旧プレーン文は decode 側で互換） */
export function encodeSceneSetting(setting: NarrationSceneSetting): string {
  const scene = (setting.scene ?? '').trim();
  const sampleContext = (setting.sampleContext ?? '').trim();
  if (!scene && !sampleContext) return '';
  return JSON.stringify({ scene, sampleContext });
}

/**
 * 保存文字列を Scene / Sample Context に戻す。
 * - JSON: { scene, sampleContext }
 * - 旧プレーン文: 全体を Sample Context として扱う
 */
export function decodeSceneSetting(raw: string | null | undefined): NarrationSceneSetting {
  const text = (raw ?? '').trim();
  if (!text) return { scene: '', sampleContext: '' };
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as { scene?: unknown; sampleContext?: unknown; value?: unknown };
      if (parsed && typeof parsed === 'object') {
        const scene = typeof parsed.scene === 'string' ? parsed.scene.trim() : '';
        const sampleContext =
          typeof parsed.sampleContext === 'string'
            ? parsed.sampleContext.trim()
            : typeof parsed.value === 'string'
              ? parsed.value.trim()
              : '';
        if (scene || sampleContext) {
          return { scene, sampleContext };
        }
      }
    } catch {
      // fall through to plain text
    }
  }
  return { scene: '', sampleContext: text };
}

/** プリセット or カスタム入力から保存用文字列を作る */
export function resolveSceneSetting(
  presetId: NarrationScenePresetId | 'custom' | string,
  customScene: string,
  customSampleContext: string,
): string {
  if (presetId === 'custom') {
    return encodeSceneSetting({
      scene: customScene.trim(),
      sampleContext: customSampleContext.trim(),
    });
  }
  const preset = NARRATION_SCENE_PRESETS.find((p) => p.id === presetId);
  if (!preset || preset.id === 'none') {
    return '';
  }
  return encodeSceneSetting({
    scene: preset.scene,
    sampleContext: preset.sampleContext,
  });
}

/** 保存値からプリセット id を推定 */
export function matchScenePresetId(raw: string): NarrationScenePresetId | 'custom' {
  const setting = decodeSceneSetting(raw);
  if (!setting.scene && !setting.sampleContext) return 'none';
  const preset = NARRATION_SCENE_PRESETS.find(
    (p) =>
      p.id !== 'none' &&
      p.scene === setting.scene &&
      p.sampleContext === setting.sampleContext,
  );
  if (preset) return preset.id;
  // 旧 value 文字列との一致も見る
  const legacy = NARRATION_SCENE_PRESETS.find(
    (p) => p.id !== 'none' && p.sampleContext === setting.sampleContext && !setting.scene,
  );
  if (legacy) return legacy.id;
  return 'custom';
}

/**
 * 既知プリセットは短い英語の Scene / Sample Context を使う（公式 corporate studio 例に近い粒度）。
 * カスタムはユーザー入力をそのまま載せる。
 */
function resolveSceneAndSampleContext(setting: NarrationSceneSetting): {
  sceneLine: string;
  sampleContextLine: string;
} {
  const preset = NARRATION_SCENE_PRESETS.find(
    (p) =>
      p.id !== 'none' &&
      p.scene === setting.scene &&
      p.sampleContext === setting.sampleContext,
  );

  if (preset && preset.id !== 'none') {
    const styleBits = [preset.styleEn, preset.pacingEn].filter(Boolean).join(' ');
    return {
      sceneLine: preset.sceneEn || setting.scene,
      sampleContextLine: styleBits || setting.sampleContext,
    };
  }

  return {
    sceneLine: setting.scene,
    sampleContextLine: setting.sampleContext,
  };
}

/**
 * TTS 用プロンプトを公式の Scene / Sample Context / [tag] 本文 形式で組み立てる。
 *
 * 公式例:
 *   Scene
 *   The Corporate Studio.
 *   Sample Context
 *   Instructional E-learning. Measured pacing...
 *   [informative] Welcome... [instruction] In this section...
 *
 * @see https://ai.google.dev/gemini-api/docs/speech-generation
 */
export function buildNarrationTtsPrompt(input: {
  /** encodeSceneSetting の結果、または旧プレーン文、または { scene, sampleContext } */
  scene?: string | NarrationSceneSetting | null;
  script: string;
}): {
  prompt: string;
  plainText: string;
  taggedBody: string;
  hasDeliveryControl: boolean;
  scene: string;
  sampleContext: string;
} {
  const setting =
    typeof input.scene === 'object' && input.scene !== null
      ? {
          scene: (input.scene.scene ?? '').trim(),
          sampleContext: (input.scene.sampleContext ?? '').trim(),
        }
      : decodeSceneSetting(input.scene ?? '');

  const scene = setting.scene;
  const sampleContext = setting.sampleContext;
  const segments = parseDeliveryMarkup(input.script ?? '');
  const plainText = segments.map((s) => s.text).join('').trim();
  const hasSegmentTone = segments.some((s) => !!s.toneTag);
  const hasSceneControl = scene.length > 0 || sampleContext.length > 0;
  const hasDeliveryControl = hasSceneControl || hasSegmentTone;
  const taggedBody = buildTaggedNarrationBody(input.script ?? '');

  if (!plainText) {
    return {
      prompt: '',
      plainText: '',
      taggedBody: '',
      hasDeliveryControl: false,
      scene,
      sampleContext,
    };
  }

  if (!hasDeliveryControl) {
    return {
      prompt: `Say the following Japanese text:\n${plainText}`,
      plainText,
      taggedBody: plainText,
      hasDeliveryControl: false,
      scene,
      sampleContext,
    };
  }

  const layers = resolveSceneAndSampleContext(setting);
  const body = hasSegmentTone ? taggedBody : plainText;

  // 公式と同じ見出し構造（Scene / Sample Context / タグ付き本文）
  const lines: string[] = [];
  if (layers.sceneLine) {
    lines.push('Scene');
    lines.push(layers.sceneLine);
  }
  if (layers.sampleContextLine) {
    if (lines.length > 0) lines.push('');
    lines.push('Sample Context');
    lines.push(layers.sampleContextLine);
  }
  if (lines.length > 0) lines.push('');
  if (hasSegmentTone) {
    lines.push(
      'Delivery tags in [square brackets] are directions only and must never be spoken.',
    );
  }
  lines.push(body);

  return {
    prompt: lines.join('\n'),
    plainText,
    taggedBody: hasSegmentTone ? taggedBody : plainText,
    hasDeliveryControl: true,
    scene,
    sampleContext,
  };
}

/** @deprecated resolveSceneSetting を使う。互換のため Sample Context のみ返す */
export function resolveSceneText(
  presetId: NarrationScenePresetId | string,
  customText: string,
): string {
  return resolveSceneSetting(presetId, '', customText);
}
