import { AudioTrack, MediaItem } from '../types';

/**
 * AudioBufferをデコードするヘルパー
 */
async function decodeAudioFile(ctx: BaseAudioContext, file: File): Promise<AudioBuffer | null> {
    try {
        const arrayBuffer = await file.arrayBuffer();
        return await ctx.decodeAudioData(arrayBuffer);
    } catch (e) {
        console.error('Failed to decode audio file:', file.name, e);
        return null;
    }
}

/**
 * フェード処理を適用するヘルパー
 */
function applyFades(
    ctx: BaseAudioContext,
    gainNode: GainNode,
    startTime: number,
    duration: number,
    volume: number,
    fadeIn: boolean,
    fadeOut: boolean,
    fadeInDur: number,
    fadeOutDur: number
) {
    // 基本ボリューム設定
    gainNode.gain.setValueAtTime(fadeIn ? 0 : volume, startTime);

    // フェードイン
    if (fadeIn && fadeInDur > 0) {
        // 直線的なフェード
        gainNode.gain.linearRampToValueAtTime(volume, startTime + fadeInDur);
    }

    // フェードアウト
    if (fadeOut && fadeOutDur > 0) {
        // フェードアウト開始時点でのボリューム（フェードインと重なる場合を考慮して計算も可能だが簡略化）
        // startTime + duration - fadeOutDur から 0 に向かう
        const fadeOutStart = Math.max(startTime, startTime + duration - fadeOutDur);
        gainNode.gain.setValueAtTime(volume, fadeOutStart);
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
    } else {
        // フェードアウトなしの場合、終了時に0にする（クリップ終了後の音漏れ防止）
        gainNode.gain.setValueAtTime(volume, startTime + duration - 0.01);
        gainNode.gain.setValueAtTime(0, startTime + duration);
    }
}

/**
 * プロジェクトの全オーディオ（ビデオ音声、BGM、ナレーション）をオフラインレンダリングする
 */
export async function renderAudioOffline(
    audioContext: BaseAudioContext,
    mediaItems: MediaItem[],
    bgm: AudioTrack | null,
    narration: AudioTrack | null,
    totalDuration: number
): Promise<AudioBuffer> {
    const sampleRate = audioContext.sampleRate;
    // 最小でも1秒確保（空の場合のエラー防止）
    const length = Math.max(Math.ceil(sampleRate * 1), Math.ceil(sampleRate * totalDuration));

    const offlineCtx = new OfflineAudioContext({
        numberOfChannels: 2,
        length: length,
        sampleRate: sampleRate,
    });

    const promises: Promise<void>[] = [];

    // --- 1. Video Items Audio ---
    let currentTime = 0;
    for (const item of mediaItems) {
        const itemDuration = item.duration;

        if (item.type === 'video' && !item.isMuted && item.file) {
            const startTime = currentTime;
            // クロージャでキャプチャして並列処理に追加
            promises.push((async () => {
                const buffer = await decodeAudioFile(offlineCtx, item.file);
                if (buffer) {
                    const source = offlineCtx.createBufferSource();
                    source.buffer = buffer;

                    const gainNode = offlineCtx.createGain();

                    // タイミング計算
                    // trimStart分オフセットして再生
                    // duration分だけ再生
                    const offset = item.trimStart || 0;

                    applyFades(
                        offlineCtx,
                        gainNode,
                        startTime,
                        itemDuration,
                        item.volume,
                        item.fadeIn,
                        item.fadeOut,
                        item.fadeInDuration,
                        item.fadeOutDuration
                    );

                    source.connect(gainNode);
                    gainNode.connect(offlineCtx.destination);

                    source.start(startTime, offset);
                    // durationより長く再生しないように停止
                    source.stop(startTime + itemDuration);
                }
            })());
        }
        currentTime += itemDuration;
    }

    // --- 2. BGM ---
    if (bgm && (bgm.file instanceof File)) {
        promises.push((async () => {
            const buffer = await decodeAudioFile(offlineCtx, bgm.file as File);
            if (buffer) {
                const source = offlineCtx.createBufferSource();
                source.buffer = buffer;
                source.loop = true; // BGM is usually looped

                const gainNode = offlineCtx.createGain();

                // BGMのdelayはタイムライン上の開始位置
                // startPointは曲の開始位置（頭出し）
                const startTime = bgm.delay || 0;
                const offset = bgm.startPoint || 0;

                // BGMの長さ（指定がなければ全体の残り）
                // ただしUI上はbgm.durationを持っているはず
                const duration = bgm.duration > 0 ? bgm.duration : (totalDuration - startTime);

                if (duration > 0) {
                    applyFades(
                        offlineCtx,
                        gainNode,
                        startTime,
                        duration,
                        bgm.volume,
                        bgm.fadeIn,
                        bgm.fadeOut,
                        bgm.fadeInDuration,
                        bgm.fadeOutDuration
                    );

                    source.connect(gainNode);
                    gainNode.connect(offlineCtx.destination);

                    source.start(startTime, offset);
                    source.stop(startTime + duration);
                }
            }
        })());
    }

    // --- 3. Narration ---
    if (narration && (narration.file instanceof File)) {
        promises.push((async () => {
            const buffer = await decodeAudioFile(offlineCtx, narration.file as File);
            if (buffer) {
                const source = offlineCtx.createBufferSource();
                source.buffer = buffer;
                source.loop = false;

                const gainNode = offlineCtx.createGain();

                const startTime = narration.delay || 0;
                const offset = narration.startPoint || 0;
                const duration = narration.duration > 0 ? narration.duration : buffer.duration;

                applyFades(
                    offlineCtx,
                    gainNode,
                    startTime,
                    duration,
                    narration.volume,
                    narration.fadeIn,
                    narration.fadeOut,
                    narration.fadeInDuration,
                    narration.fadeOutDuration
                );

                source.connect(gainNode);
                gainNode.connect(offlineCtx.destination);

                source.start(startTime, offset);
                // ナレーションもDurationで切るか、バッファエンドまでか。
                // durationプロパティがあるならそれに従う
                source.stop(startTime + duration);
            }
        })());
    }

    // 全てのデコードとスケジュールを待つ
    await Promise.all(promises);

    // レンダリング実行
    return await offlineCtx.startRendering();
}
