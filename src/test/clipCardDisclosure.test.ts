import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../types';
import {
  applyClipCardPause,
  applyClipCardSeek,
  collapseAllClipCards,
  createInitialClipCardDisclosure,
  expandAllClipCards,
  isClipCardBodyOpen,
  resolveFocusedClipId,
  stepClipCardDisclosure,
  toggleClipCard,
} from '../utils/clipCardDisclosure';

function image(id: string, duration = 5): MediaItem {
  return {
    id,
    file: new File(['x'], `${id}.png`, { type: 'image/png' }),
    type: 'image',
    url: `blob:${id}`,
    volume: 1,
    isMuted: false,
    fadeIn: false,
    fadeOut: false,
    fadeInDuration: 1,
    fadeOutDuration: 1,
    duration,
    originalDuration: duration,
    trimStart: 0,
    trimEnd: duration,
    scale: 1,
    positionX: 0,
    positionY: 0,
    rotation: 0,
    isTransformOpen: false,
    isLocked: false,
  };
}

function openIds(
  state: ReturnType<typeof createInitialClipCardDisclosure>,
  ids: string[]
): string[] {
  return ids.filter((id) => isClipCardBodyOpen(state, id));
}

describe('resolveFocusedClipId', () => {
  const items = [image('a', 5), image('b', 5), image('c', 5)];

  it('開始以上・終了未満のカードを選ぶ', () => {
    expect(resolveFocusedClipId(items, 0)).toBe('a');
    expect(resolveFocusedClipId(items, 4.9)).toBe('a');
    expect(resolveFocusedClipId(items, 5)).toBe('b');
  });

  it('本編の終了ちょうどは最後のカード', () => {
    expect(resolveFocusedClipId(items, 15)).toBe('c');
    expect(resolveFocusedClipId(items, 20)).toBe('c');
  });

  it('ディゾルブの重なりは後ろのカード', () => {
    const first = image('a', 5);
    first.transitionToNext = { type: 'dissolve', duration: 1 };
    const overlapped = [first, image('b', 5)];
    expect(resolveFocusedClipId(overlapped, 4.2)).toBe('b');
  });
});

describe('clip card disclosure', () => {
  const ids = ['c1', 'c2', 'c3', 'c4', 'c5'];

  it('シークと手動オープンの例に沿って開閉する', () => {
    let state = createInitialClipCardDisclosure('c1');
    expect(openIds(state, ids)).toEqual(['c1']);

    state = applyClipCardSeek(state, 'c3');
    expect(openIds(state, ids)).toEqual(['c3']);

    state = toggleClipCard(state, 'c5', 'c3');
    expect(openIds(state, ids)).toEqual(['c3', 'c5']);

    state = applyClipCardSeek(state, 'c4');
    expect(openIds(state, ids)).toEqual(['c4', 'c5']);

    state = toggleClipCard(state, 'c5', 'c4');
    expect(openIds(state, ids)).toEqual(['c4']);

    state = toggleClipCard(state, 'c4', 'c4');
    expect(openIds(state, ids)).toEqual([]);

    state = applyClipCardPause(state, 'c4');
    expect(openIds(state, ids)).toEqual([]);

    state = applyClipCardSeek(state, 'c2');
    expect(openIds(state, ids)).toEqual(['c2']);
  });

  it('すべて開くとフォーカスが移っても閉じない', () => {
    const opened = expandAllClipCards(ids);
    const sought = applyClipCardSeek(opened, 'c2');
    expect(openIds(sought, ids)).toEqual(ids);
  });

  it('すべて閉じたあとは同じ区間の一時停止で開かない', () => {
    const closed = collapseAllClipCards('c4');
    expect(applyClipCardPause(closed, 'c4')).toBe(closed);
    expect(openIds(applyClipCardSeek(closed, 'c2'), ids)).toEqual(['c2']);
  });

  it('再生中の境界越えでは開閉せず、別カードで止めると入れ替わる', () => {
    const initial = createInitialClipCardDisclosure('c1');
    const played = stepClipCardDisclosure(initial, {
      previousIds: ids,
      nextIds: ids,
      focusId: 'c2',
      previousFocusId: 'c1',
      isPlaying: true,
      wasPlaying: true,
      focusChangeDeltaSec: 0.05,
      restoreEpochChanged: false,
    });
    expect(played.scrollToId).toBeNull();
    expect(openIds(played.state, ids)).toEqual(['c1']);

    const paused = stepClipCardDisclosure(played.state, {
      previousIds: ids,
      nextIds: ids,
      focusId: 'c2',
      previousFocusId: 'c2',
      isPlaying: false,
      wasPlaying: true,
      focusChangeDeltaSec: 0,
      restoreEpochChanged: false,
    });
    expect(paused.scrollToId).toBe('c2');
    expect(openIds(paused.state, ids)).toEqual(['c2']);
  });

  it('追加した最後のカードを開き、前の追従カードは閉じる', () => {
    const initial = createInitialClipCardDisclosure('c1');
    const pinned = toggleClipCard(initial, 'c5', 'c1');
    const added = stepClipCardDisclosure(pinned, {
      previousIds: ids,
      nextIds: [...ids, 'c6'],
      focusId: 'c1',
      previousFocusId: 'c1',
      isPlaying: false,
      wasPlaying: false,
      focusChangeDeltaSec: 0,
      restoreEpochChanged: false,
    });
    expect(added.scrollToId).toBe('c6');
    expect(openIds(added.state, [...ids, 'c6'])).toEqual(['c5', 'c6']);
  });

  it('複数を同時に追加したときはプレビュー位置のカードを開く', () => {
    const added = stepClipCardDisclosure(createInitialClipCardDisclosure(null), {
      previousIds: [],
      nextIds: ['a', 'b', 'c', 'd'],
      focusId: 'a',
      previousFocusId: null,
      isPlaying: false,
      wasPlaying: false,
      focusChangeDeltaSec: 0,
      restoreEpochChanged: false,
    });
    expect(added.scrollToId).toBe('a');
    expect(openIds(added.state, ['a', 'b', 'c', 'd'])).toEqual(['a']);
  });

  it('読み込み直したときは再生位置のカードだけ開く', () => {
    const pinned = expandAllClipCards(ids);
    const restored = stepClipCardDisclosure(pinned, {
      previousIds: ids,
      nextIds: ['n1', 'n2'],
      focusId: 'n1',
      previousFocusId: 'c1',
      isPlaying: false,
      wasPlaying: false,
      focusChangeDeltaSec: 0,
      restoreEpochChanged: true,
    });
    expect(openIds(restored.state, ['n1', 'n2'])).toEqual(['n1']);
    expect(restored.scrollToId).toBe('n1');
  });
});
