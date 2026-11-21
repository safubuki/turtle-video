/**
 * @file aiVoiceRecents.ts
 * @description AIナレーションスタジオ用の代表ボイス（男女各4パターン）と、
 * よく使う声の使用履歴（localStorage 保存）を管理する純ユーティリティ。
 */
import type { VoiceId } from '../types';

export const AI_VOICE_USAGE_STORAGE_KEY = 'turtle-video-ai-voice-usage';

export interface QuickVoiceOption {
  id: VoiceId;
  gender: 'female' | 'male';
  /** 一目で声の調子が伝わる日本語ラベル */
  shortLabel: string;
  /** 補足説明 */
  hint: string;
}

/**
 * 通常画面でワンタップ選択できる代表ボイス（女性4種・男性4種）。
 * 公式 trait に基づき、声の調子が明確に異なるパターンを厳選している。
 */
export const QUICK_FEMALE_VOICES: ReadonlyArray<QuickVoiceOption> = [
  { id: 'Zephyr', gender: 'female', shortLabel: '明るい', hint: '明るく元気' },
  { id: 'Leda', gender: 'female', shortLabel: '若々しい', hint: 'フレッシュ' },
  { id: 'Kore', gender: 'female', shortLabel: 'しっかり', hint: '解説・芯あり' },
  { id: 'Achernar', gender: 'female', shortLabel: 'やわらかい', hint: 'しっとり穏やか' },
];

export const QUICK_MALE_VOICES: ReadonlyArray<QuickVoiceOption> = [
  { id: 'Puck', gender: 'male', shortLabel: '陽気・元気', hint: '軽快で楽しい' },
  { id: 'Charon', gender: 'male', shortLabel: '落ち着き', hint: '知的・解説' },
  { id: 'Enceladus', gender: 'male', shortLabel: 'しっとり', hint: '息づかい・優しめ' },
  { id: 'Algenib', gender: 'male', shortLabel: '渋い・低め', hint: '重厚・しゃがれ' },
];

export interface AiVoiceUsageEntry {
  id: string;
  count: number;
  lastUsedAt: number;
  label?: string;
  gender?: 'female' | 'male' | 'neutral' | 'unknown';
  shortLabel?: string;
}

type UsageMap = Record<string, AiVoiceUsageEntry>;

function normalizeUsageGender(
  gender: unknown,
): 'female' | 'male' | 'neutral' | 'unknown' | undefined {
  if (gender === 'female' || gender === 'male' || gender === 'neutral' || gender === 'unknown') {
    return gender;
  }
  return undefined;
}

function readUsageMap(): UsageMap {
  try {
    const raw = localStorage.getItem(AI_VOICE_USAGE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: UsageMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const item = value as Partial<AiVoiceUsageEntry>;
      if (typeof item.count === 'number' && Number.isFinite(item.count) && item.count > 0) {
        result[key] = {
          id: key,
          count: Math.floor(item.count),
          lastUsedAt: typeof item.lastUsedAt === 'number' && Number.isFinite(item.lastUsedAt) ? item.lastUsedAt : 0,
          label: typeof item.label === 'string' ? item.label : undefined,
          gender: normalizeUsageGender(item.gender),
          shortLabel: typeof item.shortLabel === 'string' ? item.shortLabel : undefined,
        };
      }
    }
    return result;
  } catch {
    return {};
  }
}

function writeUsageMap(map: UsageMap): void {
  try {
    // 肥大化を防ぐため使用頻度上位 30 件だけ保持する
    const entries = Object.values(map)
      .sort((a, b) => (b.count - a.count) || (b.lastUsedAt - a.lastUsedAt))
      .slice(0, 30);
    const compacted: UsageMap = {};
    for (const entry of entries) {
      compacted[entry.id] = entry;
    }
    localStorage.setItem(AI_VOICE_USAGE_STORAGE_KEY, JSON.stringify(compacted));
  } catch {
    // localStorage が使えない環境では無視
  }
}

/** 履歴に未登録の声を保護登録する（別の声へ誤って切り替えてもワンタップで戻せるようにする） */
export function ensureAiVoiceInHistory(params: {
  id: string;
  label?: string;
  gender?: 'female' | 'male' | 'neutral' | 'unknown';
  shortLabel?: string;
}): AiVoiceUsageEntry[] {
  const id = params.id.trim();
  if (!id) return getFrequentAiVoices();
  const map = readUsageMap();
  if (!map[id]) {
    map[id] = {
      id,
      count: 1,
      lastUsedAt: Math.max(1, Date.now() - 1),
      label: params.label,
      gender: params.gender,
      shortLabel: params.shortLabel,
    };
    writeUsageMap(map);
  }
  return getFrequentAiVoices();
}

/** 声の使用回数を 1 加算して記録する */
export function recordAiVoiceUsage(params: {
  id: string;
  label?: string;
  gender?: 'female' | 'male' | 'neutral' | 'unknown';
  shortLabel?: string;
}): AiVoiceUsageEntry[] {
  const id = params.id.trim();
  if (!id) return getFrequentAiVoices();
  const map = readUsageMap();
  const prev = map[id];
  map[id] = {
    id,
    count: (prev?.count ?? 0) + 1,
    lastUsedAt: Date.now(),
    label: params.label || prev?.label,
    gender: params.gender || prev?.gender,
    shortLabel: params.shortLabel || prev?.shortLabel,
  };
  writeUsageMap(map);
  return getFrequentAiVoices();
}

/** 使用頻度の高い声（同回数は直近優先）を上位 maxCount 件返す */
export function getFrequentAiVoices(maxCount = 4): AiVoiceUsageEntry[] {
  const map = readUsageMap();
  return Object.values(map)
    .sort((a, b) => (b.count - a.count) || (b.lastUsedAt - a.lastUsedAt))
    .slice(0, Math.max(0, maxCount));
}
