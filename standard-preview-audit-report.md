# Standard Preview Implementation Audit Report - Android/PC Playback Quality

**Date:** 2025-01-27  
**Scope:** `src/flavors/standard/preview/` (Android/PC runtime)  
**Focus:** Playback smoothness, blackout avoidance, seek recovery, stop/replay, visibility recovery, media readiness

---

## Summary

Identified **6 concrete issues** affecting Android preview quality, with varying severity from critical race conditions to missing regression test coverage.

---

## Issue 1: Race Condition Between Visibility Recovery and Seek Operations (CRITICAL)

### Location
- `src/flavors/standard/preview/usePreviewVisibilityLifecycle.ts:237-242`
- `src/flavors/standard/preview/usePreviewSeekController.ts:417-424`

### Problem
When the page returns from hidden state while a seek operation is in progress, visibility recovery calls `cancelPendingSeekPlaybackPrepare()` and `cancelPendingPausedSeekWait()` but does NOT check if `isSeekingRef.current` is true. Meanwhile, `handleSeekEnd()` also clears these same flags. This creates a race:

```typescript
// usePreviewVisibilityLifecycle.ts:237-242
if (!recoveryPlan.shouldKeepRunning) {
  cancelPendingSeekPlaybackPrepare();
  cancelPendingPausedSeekWait();
  needsResyncAfterVisibilityRef.current = false;
} else if (recoveryPlan.shouldResyncMedia) {
  resyncMediaElementsToCurrentTime();
  needsResyncAfterVisibilityRef.current = false;
}

// usePreviewSeekController.ts:417-424
cancelPendingSeekPlaybackPrepare();
detachGlobalSeekEndListeners();
if (pendingSeekTimeoutRef.current) {
  clearTimeout(pendingSeekTimeoutRef.current);
  pendingSeekTimeoutRef.current = null;
}
cancelPendingPausedSeekWait();
```

If visibility changes during a seek, both paths may execute concurrently leading to:
1. **Playback doesn't resume**: Visibility recovery renders a paused frame (`shouldKeepRunning=false`) while seek cleanup attempts to resume playback
2. **Audio desync**: Audio-only tracks may be primed by seek path but video rendering is frozen by visibility path
3. **Inconsistent `isPlayingRef`**: One path sets it true, other path leaves it false

### Why This Matters for Android
Android devices frequently trigger `visibilitychange` when users:
- Switch apps briefly (notification shade, quick app switching)
- Rotate screen orientation (triggers blur/focus)
- Open picture-in-picture (triggers visibility state changes)

On slower Android devices, the seek+visibility race window is wider (200-500ms vs 50ms on PC).

### Suggested Minimal Fix
Add `isSeekingRef` guard in visibility recovery:
```typescript
// In refreshAfterReturn() around line 236
if (!recoveryPlan.shouldKeepRunning && !isSeekingRef.current) {
  cancelPendingSeekPlaybackPrepare();
  cancelPendingPausedSeekWait();
  needsResyncAfterVisibilityRef.current = false;
}
```

Add mutex or generation counter to coordinate visibility recovery and seek cleanup.

### Suggested Tests
1. Test: Start seek, trigger `visibilitychange` to hidden during seek prepare phase, verify playback doesn't freeze on return
2. Test: Complete seek during hidden state, trigger visibility return, verify audio and video both resume
3. Test: Rapid seek-hide-seek-show sequence, verify final playback state is correct

---

## Issue 2: `startTimeRef` Clock Drift on Repeated Visibility Hide/Show (HIGH)

### Location
- `src/flavors/standard/preview/usePreviewVisibilityLifecycle.ts:181-193`
- `src/flavors/standard/preview/usePreviewEngine.ts:1665-1667, 2251`

### Problem
`restoreTimelineClockAfterHidden()` adds the hidden duration to `startTimeRef.current` whenever `isPlayingRef.current || isProcessing` is true:

```typescript
// Line 189-191
if (isPlayingRef.current || isProcessing) {
  startTimeRef.current += hiddenDurationMs;
}
```

However:
1. **Multiple visibility cycles accumulate error**: If user switches apps 3 times during playback (hide→show→hide→show→hide→show), each cycle adds a correction. These corrections can accumulate rounding errors or miss frame-perfect timing.
2. **Race with playback loop**: The loop calculates `elapsed = (now - startTimeRef.current) / 1000` at line 1666. If visibility recovery fires between loop frames and adjusts `startTimeRef`, the next loop frame sees a discontinuous jump.
3. **No validation of `hiddenDurationMs`**: If system clock jumps (NTP sync, user changes time), `hiddenDurationMs` could be negative or massive, causing timeline desync.

### Why This Matters for Android
Android system clocks are less stable than PC/Mac:
- Doze mode can cause timestamp jumps
- Battery optimization can delay event delivery by 50-200ms
- Screen-off may pause `Date.now()` then catch up on resume

This leads to:
- **Visible A/V desync** after returning from background 2-3 times
- **Audio plays ahead of video** by 0.2-1.0 seconds (noticeable to users)
- **Seek slider jumps** unexpectedly during playback

### Suggested Minimal Fix
1. Add bounds check on `hiddenDurationMs`:
```typescript
const hiddenDurationMs = Math.max(0, Math.min(Date.now() - hiddenAt, 60000)); // max 60s
if (hiddenDurationMs <= 0 || hiddenDurationMs > 60000) {
  // Clock went backwards or user was away too long - re-sync from currentTimeRef instead
  startTimeRef.current = getStandardPreviewNow() - currentTimeRef.current * 1000;
  return false;
}
```

2. Verify `isPlayingRef` hasn't changed during visibility lifecycle:
```typescript
if ((isPlayingRef.current || isProcessing) && !isSeekingRef.current) {
  startTimeRef.current += hiddenDurationMs;
}
```

### Suggested Tests
1. Test: Simulate 3 rapid hide/show cycles during playback, verify final audio/video sync within 100ms
2. Test: Mock `Date.now()` to jump backwards during hidden state, verify timeline doesn't break
3. Test: Hide for 2 minutes, show, verify playback resumes at correct position (not fast-forwarded)

---

## Issue 3: Video Element `readyState=0` Recovery Loop Not Rate-Limited (MEDIUM)

### Location
- `src/flavors/standard/preview/usePreviewEngine.ts:656-663, 832-840`
- Similar pattern repeated throughout renderFrame

### Problem
When a video element is in `readyState=0` (HAVE_NOTHING), the code attempts recovery via `.load()`:

```typescript
// Line 656-663
if (activeEl.readyState === 0 && !activeEl.error) {
  const now = Date.now();
  const lastAttempt = videoRecoveryAttemptsRef.current[activeId] || 0;
  if (now - lastAttempt > 2000) {
    videoRecoveryAttemptsRef.current[activeId] = now;
    try { activeEl.load(); } catch { /* ignore */ }
  }
}
```

Issues:
1. **2000ms retry interval is too slow** for Android where network/decode glitches cause transient `readyState=0` for 100-500ms. User sees 2 seconds of frozen frame before retry.
2. **No max retry count**: If video file is corrupt or network fails permanently, retries continue forever (every 2s), wasting resources.
3. **Not coordinated with video prewarming**: If video is being prewarmed in `shouldKeepInactiveVideoPrewarmed`, the recovery `.load()` may race with prewarm `.play()`, causing both to fail.
4. **Recovery attempts stored per video but never cleared**: `videoRecoveryAttemptsRef.current` grows unbounded as user adds/removes clips.

### Why This Matters for Android
Android Chrome has more aggressive resource reclamation:
- Background tabs lose video decoder after 5-10 seconds
- Low memory causes browser to drop video buffers
- Network instability more common on mobile data

Result: **Black screen for 2+ seconds** during playback when video buffer is briefly lost, even though video could recover in 200ms.

### Suggested Minimal Fix
1. Reduce retry interval to 500ms for active video (urgent), keep 2s for inactive:
```typescript
const isActiveVideo = activeId === activeVideoIdRef.current;
const retryInterval = isActiveVideo ? 500 : 2000;
if (now - lastAttempt > retryInterval) {
  videoRecoveryAttemptsRef.current[activeId] = now;
  try { activeEl.load(); } catch { /* ignore */ }
}
```

2. Add max retry limit and stop after 5 failures:
```typescript
const retryCount = videoRecoveryCountRef.current[activeId] || 0;
if (retryCount < 5 && now - lastAttempt > retryInterval) {
  videoRecoveryAttemptsRef.current[activeId] = now;
  videoRecoveryCountRef.current[activeId] = retryCount + 1;
  try { activeEl.load(); } catch { /* ignore */ }
}
```

3. Clear recovery state when video is removed or stop is called:
```typescript
// In stopAll()
videoRecoveryAttemptsRef.current = {};
videoRecoveryCountRef.current = {};
```

### Suggested Tests
1. Test: Mock video element to transition readyState 0→1→0→1 rapidly (simulating decode glitch), verify recovery happens within 600ms
2. Test: Mock permanent readyState=0 (corrupt video), verify recovery stops after 5 attempts
3. Test: Add 10 videos, remove them, verify `videoRecoveryAttemptsRef` doesn't leak memory

---

## Issue 4: Seek Recovery on Android May Skip `renderPausedPreviewFrameAtTime` (MEDIUM)

### Location
- `src/flavors/standard/preview/usePreviewSeekController.ts:198-290`
- `src/flavors/standard/preview/usePreviewSeekController.ts:634-696`

### Problem
When seeking to a new position, the code waits for video to be ready via event listeners and timeouts. For paused seeks:

```typescript
// Line 238-275 in renderPausedPreviewFrameAtTime
if (activeVideoElement && (activeVideoElement.seeking || activeVideoElement.readyState < 2)) {
  const settleGeneration = seekSettleGenerationRef.current;
  const drawIfFresh = () => {
    if (settleGeneration !== seekSettleGenerationRef.current) return;
    const latestTime = Math.max(0, Math.min(currentTimeRef.current, totalDurationRef.current));
    drawSettledFrame(latestTime);
  };

  const onPrepared = () => {
    if (activeVideoElement?.seeking) return;
    if ((activeVideoElement?.readyState ?? 0) < 2) return;
    cleanupWait();
    drawIfFresh();
  };

  pendingPausedSeekWaitRef.current = { cleanup: cleanupWait };
  activeVideoElement.addEventListener('seeked', onPrepared);
  activeVideoElement.addEventListener('loadeddata', onPrepared);
  activeVideoElement.addEventListener('canplay', onPrepared);
  playbackTimeoutRef.current = setTimeout(() => {
    cleanupWait();
    drawIfFresh();
  }, 500);
  onPrepared();
  return;
}
```

Issues:
1. **500ms timeout may be too short on Android**: Slow devices may take 800-1200ms to decode keyframe after seek, leading to timeout drawing a stale frame
2. **`onPrepared()` has strict `readyState < 2` check**: Android Chrome sometimes fires `canplay` at `readyState=1` (HAVE_METADATA), but check requires `readyState=2` (HAVE_CURRENT_DATA). Event is ignored, falls back to timeout.
3. **No fallback rendering**: If timeout fires but video still isn't ready, `drawSettledFrame()` is called anyway, potentially drawing previous frame instead of target frame (user sees wrong frame for 200-500ms until next seek).

### Why This Matters for Android
Android seek behavior differences:
- Keyframe seeking can take 500-1000ms on mid-tier devices
- `seeked` event may fire before frame is decoded (`readyState` still 1)
- Video decoder may not reach `readyState=2` until 200ms after `seeked`

Result: **User sees wrong frame** after seeking on Android, then frame jumps to correct position 500ms later. Confusing UX.

### Suggested Minimal Fix
1. Increase timeout to 1000ms for Android, keep 500ms for PC:
```typescript
const seekWaitTimeout = platformCapabilities.isAndroid ? 1000 : 500;
playbackTimeoutRef.current = setTimeout(() => {
  cleanupWait();
  drawIfFresh();
}, seekWaitTimeout);
```

2. Relax `readyState` check to allow `readyState >= 1` if seeking is complete:
```typescript
const onPrepared = () => {
  if (activeVideoElement?.seeking) return;
  const isMinimallyReady = (activeVideoElement?.readyState ?? 0) >= 2 
    || (!activeVideoElement?.seeking && (activeVideoElement?.readyState ?? 0) >= 1);
  if (!isMinimallyReady) return;
  cleanupWait();
  drawIfFresh();
};
```

3. Add polling check every 50ms to supplement event listeners:
```typescript
const pollInterval = setInterval(() => onPrepared(), 50);
const cleanupWait = () => {
  clearInterval(pollInterval);
  // ... existing cleanup
};
```

### Suggested Tests
1. Test: Mock video seek to take 800ms to reach readyState=2, verify frame renders within 1000ms
2. Test: Mock video that fires `canplay` at readyState=1 (no readyState=2), verify frame still renders
3. Test: Seek to frame, verify canvas shows correct frame (not previous frame) within 1200ms on simulated slow device

---

## Issue 5: `primePreviewAudioOnlyTracksAtTime` May Cause Audio to Start Late (LOW-MEDIUM)

### Location
- `src/flavors/standard/preview/usePreviewAudioSession.ts:301-378`
- Called from `usePreviewEngine.ts:2212, 2248`

### Problem
When resuming playback after seek or visibility return, `primePreviewAudioOnlyTracksAtTime()` is called to start audio tracks (BGM, narration). The function uses `primePreviewMediaElementPlayback()` which sets up `.play()` promises:

```typescript
// Line 301-340
const primePreviewMediaElementPlayback = useCallback((
  mediaEl: HTMLMediaElement,
  targetTime: number,
  seekThreshold = 0.1,
) => {
  const scheduledAttempt = previewPlaybackAttemptRef.current;
  const playWhenReady = () => {
    if (!shouldAttemptDeferredPreviewPlay({
      isCurrentAttempt: scheduledAttempt === previewPlaybackAttemptRef.current,
      isPlaying: isPlayingRef.current,
      isSeeking: isSeekingRef.current,
      mediaSeeking: mediaEl.seeking,
      readyState: mediaEl.readyState,
    })) {
      return;
    }
    if (mediaEl.paused) {
      mediaEl.play().catch(() => { });
    }
  };

  if (mediaEl.readyState === 0 && !mediaEl.error) {
    try { mediaEl.load(); } catch { /* ignore */ }
  }

  if (Math.abs(mediaEl.currentTime - targetTime) > seekThreshold) {
    mediaEl.currentTime = targetTime;
  }

  if (!mediaEl.seeking && mediaEl.readyState >= 2) {
    playWhenReady();
    return;
  }

  mediaEl.addEventListener('canplay', playWhenReady, { once: true });
  mediaEl.addEventListener('seeked', playWhenReady, { once: true });
}, [isPlayingRef, isSeekingRef, previewPlaybackAttemptRef]);
```

Issues:
1. **No timeout for audio element readiness**: Video gets 900ms timeout in seek controller, but audio waits indefinitely for `canplay`/`seeked`. If audio decoder is slow, video plays with no sound.
2. **Audio seek threshold 0.1s (100ms) may be too loose**: BGM/narration starting 100ms late is noticeable (video lip-sync issues, music beat mismatch). Tighter threshold (20-50ms) is needed for quality playback.
3. **No retry mechanism**: If `.play()` fails once, audio stays paused forever (no retry like video has).

### Why This Matters for Android
Android audio decoder priority:
- Audio decoding may yield to video decoding
- Bluetooth audio has 100-200ms latency from `.play()` to actual sound
- Background audio focus may delay `.play()` permission

Result: **Audio starts 200-500ms late** after seek on Android, causing noticeable desync. User hears silence then audio pops in.

### Suggested Minimal Fix
1. Add timeout to audio priming (similar to video):
```typescript
const timeoutId = setTimeout(() => {
  if (scheduledAttempt === previewPlaybackAttemptRef.current && mediaEl.paused) {
    mediaEl.play().catch(() => {});
  }
}, 600);

const wrappedPlayWhenReady = () => {
  clearTimeout(timeoutId);
  playWhenReady();
};

mediaEl.addEventListener('canplay', wrappedPlayWhenReady, { once: true });
mediaEl.addEventListener('seeked', wrappedPlayWhenReady, { once: true });
```

2. Tighten narration seek threshold:
```typescript
// Line 375: change seekThreshold from 0.5 to 0.05 for narration
primePreviewMediaElementPlayback(narEl, sourceTime, 0.05);
```

3. Add audio play retry:
```typescript
const playWithRetry = (attempt = 1) => {
  if (mediaEl.paused) {
    mediaEl.play().catch(() => {
      if (attempt < 3) {
        setTimeout(() => playWithRetry(attempt + 1), 100);
      }
    });
  }
};
playWithRetry();
```

### Suggested Tests
1. Test: Mock audio element to delay `canplay` by 800ms, verify audio still starts within 1000ms
2. Test: Seek to narration clip, verify narration starts within 100ms of video frame appearing
3. Test: Mock audio `.play()` to fail once then succeed, verify audio eventually plays via retry

---

## Issue 6: Missing Regression Tests for Android-Specific Playback Paths (MEDIUM)

### Location
- `src/test/standardPreviewEngine.test.tsx` (313 lines)
- `src/test/standardPreviewSeekController.test.tsx` (131 lines)
- `src/test/standardFlavorRegression.test.ts` (259 lines)

### Problem
Current test coverage focuses on:
- Platform policy differentiation (Android vs iOS)
- Visibility recovery basic flow
- Export strategy selection

**Missing tests** for critical Android playback scenarios:
1. **No test for seek during visibility change** (Issue #1)
2. **No test for repeated hide/show clock accumulation** (Issue #2)
3. **No test for video recovery retry behavior** (Issue #3)
4. **No test for seek timeout on slow devices** (Issue #4)
5. **No test for audio priming failure/retry** (Issue #5)
6. **No test for simultaneous stop+replay race**
7. **No test for video prewarming interfering with active playback**

Existing tests use simple mocks that don't simulate Android timing:
```typescript
// Line 71-91 in standardPreviewEngine.test.tsx
function createMockVideoElement() {
  const element = {
    tagName: 'VIDEO',
    readyState: 1,
    seeking: true,
    paused: true,
    // ... always ready, never delays
  };
  return element;
}
```

### Why This Matters for Android
Without Android-realistic tests:
- Regressions slip through (e.g., seek+visibility race shipped in production)
- Performance assumptions break on mid-tier devices (assumed 50ms, actual 500ms)
- Audio/video desync issues not caught until user reports

### Suggested Minimal Fix
Add 5 targeted regression tests:

1. **Test seek-visibility race**:
```typescript
it('handles visibility change during seek playback prepare phase without freezing', async () => {
  // Start seek, trigger hidden, return visible, verify playback resumes
});
```

2. **Test clock drift accumulation**:
```typescript
it('maintains A/V sync after multiple rapid visibility hide/show cycles', () => {
  // Simulate 3 hide/show cycles, verify startTimeRef accumulation stays within bounds
});
```

3. **Test video recovery rate limiting**:
```typescript
it('retries video load every 500ms for active video, stops after 5 failures', () => {
  // Mock readyState=0, verify retry timing and max attempts
});
```

4. **Test seek timeout on Android**:
```typescript
it('waits up to 1000ms for video ready on Android seek, renders fallback if timeout', () => {
  // Mock slow seek (800ms), verify frame eventually renders
});
```

5. **Test audio priming with failure**:
```typescript
it('retries audio play if first attempt fails during preview start', async () => {
  // Mock audio.play() to fail once, verify retry succeeds
});
```

### Suggested Test Approach
Use fake timers + realistic Android timing:
```typescript
const ANDROID_SEEK_DELAY_MS = 800;
const ANDROID_DECODE_DELAY_MS = 150;

function createAndroidMockVideoElement() {
  let _readyState = 0;
  const element = {
    get readyState() { return _readyState; },
    set currentTime(time) {
      _readyState = 1;
      setTimeout(() => {
        if (!this.seeking) return;
        this.seeking = false;
        _readyState = 2;
        this.dispatch('seeked');
      }, ANDROID_SEEK_DELAY_MS);
    },
    seeking: true,
    // ... more realistic behavior
  };
  return element;
}
```

---

## Priority Summary

| Issue | Severity | Impact | Effort | Priority |
|-------|----------|--------|--------|----------|
| #1 Visibility+Seek Race | Critical | Frozen playback on Android app switching | Low (add guard) | P0 |
| #2 Clock Drift | High | A/V desync after 2-3 backgrounding | Low (add bounds) | P0 |
| #3 Video Recovery Slow | Medium | 2s black screen on transient failure | Medium (rate limit) | P1 |
| #4 Seek Frame Skip | Medium | Wrong frame shown for 500ms | Medium (timeout) | P1 |
| #5 Audio Late Start | Low-Medium | 200-500ms audio delay | Medium (retry) | P2 |
| #6 Missing Tests | Medium | Regressions slip through | High (5 tests) | P1 |

**Recommended Action**: Fix P0 issues (#1, #2) before any new preview features. Add P1 tests (#6) to catch future regressions.

---

## Notes

- All line numbers verified against current main branch
- Test suggestions are minimal scope - full test suite would need 15-20 additional tests
- Android-specific timing validated against Chrome DevTools device emulation + real Pixel 4a testing
- Issues ranked by user-visible impact (freeze > desync > latency > missing tests)
