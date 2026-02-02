import { useEffect } from 'react';
import useMediaStore from '../stores/mediaStore';
import useAudioStore from '../stores/audioStore';
import { useCaptionStore } from '../stores/captionStore';

/**
 * 編集中のデータがある場合にブラウザの離脱を防止するフック
 */
export const usePreventUnload = () => {
    const mediaItems = useMediaStore((state) => state.mediaItems);
    const bgm = useAudioStore((state) => state.bgm);
    const narration = useAudioStore((state) => state.narration);
    const captions = useCaptionStore((state) => state.captions);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            const hasUnsavedChanges =
                mediaItems.length > 0 ||
                bgm !== null ||
                narration !== null ||
                captions.length > 0;

            if (hasUnsavedChanges) {
                e.preventDefault();
                // 多くのブラウザではこのメッセージは表示されませんが、標準仕様として設定します
                e.returnValue = '編集中のデータがあります。ページを離れてもよろしいですか？';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [mediaItems, bgm, narration, captions]);
};
