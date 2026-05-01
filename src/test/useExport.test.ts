import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformCapabilities } from '../utils/platform';

const { mockGetPlatformCapabilities, mockRunIosSafariMediaRecorderStrategy } = vi.hoisted(() => ({
  mockGetPlatformCapabilities: vi.fn(),
  mockRunIosSafariMediaRecorderStrategy: vi.fn(),
}));

vi.mock('../utils/platform', async () => {
  const actual = await vi.importActual<typeof import('../utils/platform')>('../utils/platform');
  return {
    ...actual,
    getPlatformCapabilities: mockGetPlatformCapabilities,
  };
});

vi.mock('../flavors/apple-safari/export/iosSafariMediaRecorder', () => ({
  runIosSafariMediaRecorderStrategy: mockRunIosSafariMediaRecorderStrategy,
}));

import { clampAudioTrackVolume } from '../hooks/useExport';
import { useExport as useAppleSafariExport } from '../flavors/apple-safari/export/useExport';
import { useExport as useStandardExport } from '../flavors/standard/export/useExport';

function createPlatformCapabilities(
  overrides: Partial<PlatformCapabilities> = {},
): PlatformCapabilities {
  return {
    userAgent: 'test-agent',
    platform: 'test-platform',
    maxTouchPoints: 0,
    isAndroid: false,
    isIOS: false,
    isSafari: false,
    isIosSafari: false,
    supportsShowSaveFilePicker: false,
    supportsShowOpenFilePicker: false,
    supportsTrackProcessor: false,
    supportsMp4MediaRecorder: false,
    audioContextMayInterrupt: false,
    supportedMediaRecorderProfile: null,
    trackProcessorCtor: undefined,
    ...overrides,
  };
}

function createStartExportArgs() {
  const audioContext = {
    sampleRate: 48000,
    state: 'running',
  } as AudioContext;
  const canvasRef = {
    current: {
      width: 1280,
      height: 720,
      captureStream: vi.fn(),
    } as unknown as HTMLCanvasElement,
  };
  const masterDestRef = {
    current: {
      context: audioContext,
      stream: {
        getAudioTracks: () => [],
      },
    } as unknown as MediaStreamAudioDestinationNode,
  };

  return {
    canvasRef,
    masterDestRef,
    onRecordingStop: vi.fn(),
    onRecordingError: vi.fn(),
  };
}

describe('useExport', () => {
  beforeEach(() => {
    mockGetPlatformCapabilities.mockReset();
    mockRunIosSafariMediaRecorderStrategy.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('初期化に必要な ref が無ければ即座にエラーを返す', async () => {
    const { result } = renderHook(() => useStandardExport());
    const onRecordingError = vi.fn();

    await act(async () => {
      await result.current.startExport(
        { current: null },
        { current: null },
        vi.fn(),
        onRecordingError,
      );
    });

    expect(onRecordingError).toHaveBeenCalledWith('エクスポートの初期化に失敗しました。');
    expect(result.current.isProcessing).toBe(false);
  });

  it('iOS 条件では iOS strategy を呼び出し、ハンドリング済みならそこで終了する', async () => {
    mockGetPlatformCapabilities.mockReturnValue(
      createPlatformCapabilities({
        isIOS: true,
        isSafari: true,
        isIosSafari: true,
        supportsMp4MediaRecorder: true,
        supportedMediaRecorderProfile: {
          mimeType: 'video/mp4',
          extension: 'mp4',
        },
      }),
    );
    mockRunIosSafariMediaRecorderStrategy.mockResolvedValue(true);

    const { result } = renderHook(() => useAppleSafariExport());
    const args = createStartExportArgs();

    await act(async () => {
      await result.current.startExport(
        args.canvasRef,
        args.masterDestRef,
        args.onRecordingStop,
        args.onRecordingError,
      );
    });

    expect(mockRunIosSafariMediaRecorderStrategy).toHaveBeenCalledTimes(1);
    expect(args.onRecordingError).not.toHaveBeenCalled();
    expect(result.current.isProcessing).toBe(false);
  });

  it('iOS strategy が false を返した場合は WebCodecs 側へフォールバックする', async () => {
    mockGetPlatformCapabilities.mockReturnValue(
      createPlatformCapabilities({
        isIOS: true,
        isSafari: true,
        isIosSafari: true,
        supportsMp4MediaRecorder: true,
        supportedMediaRecorderProfile: {
          mimeType: 'video/mp4',
          extension: 'mp4',
        },
      }),
    );
    mockRunIosSafariMediaRecorderStrategy.mockResolvedValue(false);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { result } = renderHook(() => useAppleSafariExport());
    const args = createStartExportArgs();

    await act(async () => {
      await result.current.startExport(
        args.canvasRef,
        args.masterDestRef,
        args.onRecordingStop,
        args.onRecordingError,
      );
    });

    expect(mockRunIosSafariMediaRecorderStrategy).toHaveBeenCalledTimes(1);
    expect(args.onRecordingError).toHaveBeenCalledWith(
      expect.stringContaining('WebCodecsに対応していないブラウザです'),
    );
    expect(result.current.isProcessing).toBe(false);
  });

  it('stopExport は進行中セッションの AbortSignal を中断し、処理中状態を戻す', async () => {
    mockGetPlatformCapabilities.mockReturnValue(
      createPlatformCapabilities({
        isIOS: true,
        isSafari: true,
        isIosSafari: true,
        supportsMp4MediaRecorder: true,
        supportedMediaRecorderProfile: {
          mimeType: 'video/mp4',
          extension: 'mp4',
        },
      }),
    );

    let capturedSignal: AbortSignal | null = null;
    mockRunIosSafariMediaRecorderStrategy.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<boolean>((resolve) => {
          capturedSignal = signal;
          signal.addEventListener('abort', () => resolve(false), { once: true });
        }),
    );

    const { result } = renderHook(() => useAppleSafariExport());
    const args = createStartExportArgs();

    await act(async () => {
      result.current.startExport(
        args.canvasRef,
        args.masterDestRef,
        args.onRecordingStop,
        args.onRecordingError,
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.isProcessing).toBe(true);
    });
    expect(capturedSignal).not.toBeNull();

    act(() => {
      result.current.stopExport();
    });

    const activeSignal = capturedSignal;
    if (!activeSignal) {
      throw new Error('AbortSignal was not captured');
    }
    expect((activeSignal as AbortSignal).aborted).toBe(true);
    expect(result.current.isProcessing).toBe(false);

    await waitFor(() => {
      expect(mockRunIosSafariMediaRecorderStrategy).toHaveBeenCalledTimes(1);
    });
    expect(args.onRecordingError).not.toHaveBeenCalled();
  });

  it('stopExport({ reason: "user" }) は明示キャンセルとして中断エラーを通知する', async () => {
    mockGetPlatformCapabilities.mockReturnValue(
      createPlatformCapabilities({
        isIOS: true,
        isSafari: true,
        isIosSafari: true,
        supportsMp4MediaRecorder: true,
        supportedMediaRecorderProfile: {
          mimeType: 'video/mp4',
          extension: 'mp4',
        },
      }),
    );

    mockRunIosSafariMediaRecorderStrategy.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<boolean>((resolve) => {
          signal.addEventListener('abort', () => resolve(false), { once: true });
        }),
    );

    const { result } = renderHook(() => useAppleSafariExport());
    const args = createStartExportArgs();

    await act(async () => {
      result.current.startExport(
        args.canvasRef,
        args.masterDestRef,
        args.onRecordingStop,
        args.onRecordingError,
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.isProcessing).toBe(true);
    });

    act(() => {
      result.current.stopExport({ reason: 'user' });
    });

    await waitFor(() => {
      expect(args.onRecordingError).toHaveBeenCalledWith('エクスポートが中断されました');
    });
  });

  it.each(['superseded', 'unmount'] as const)(
    'stopExport({ reason: "%s" }) は system cleanup 扱いで中断エラーを通知しない',
    async (reason) => {
      mockGetPlatformCapabilities.mockReturnValue(
        createPlatformCapabilities({
          isIOS: true,
          isSafari: true,
          isIosSafari: true,
          supportsMp4MediaRecorder: true,
          supportedMediaRecorderProfile: {
            mimeType: 'video/mp4',
            extension: 'mp4',
          },
        }),
      );

      mockRunIosSafariMediaRecorderStrategy.mockImplementation(
        ({ signal }: { signal: AbortSignal }) =>
          new Promise<boolean>((resolve) => {
            signal.addEventListener('abort', () => resolve(false), { once: true });
          }),
      );

      const { result } = renderHook(() => useAppleSafariExport());
      const args = createStartExportArgs();

      await act(async () => {
        result.current.startExport(
          args.canvasRef,
          args.masterDestRef,
          args.onRecordingStop,
          args.onRecordingError,
        );
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(true);
      });

      act(() => {
        result.current.stopExport({ reason });
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });
      expect(args.onRecordingError).not.toHaveBeenCalled();
    },
  );

  it('stopExport({ silent: true, reason: "user" }) は中断エラーを通知しない', async () => {
    mockGetPlatformCapabilities.mockReturnValue(
      createPlatformCapabilities({
        isIOS: true,
        isSafari: true,
        isIosSafari: true,
        supportsMp4MediaRecorder: true,
        supportedMediaRecorderProfile: {
          mimeType: 'video/mp4',
          extension: 'mp4',
        },
      }),
    );

    mockRunIosSafariMediaRecorderStrategy.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<boolean>((resolve) => {
          signal.addEventListener('abort', () => resolve(false), { once: true });
        }),
    );

    const { result } = renderHook(() => useAppleSafariExport());
    const args = createStartExportArgs();

    await act(async () => {
      result.current.startExport(
        args.canvasRef,
        args.masterDestRef,
        args.onRecordingStop,
        args.onRecordingError,
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.isProcessing).toBe(true);
    });

    act(() => {
      result.current.stopExport({ silent: true, reason: 'user' });
    });

    await waitFor(() => {
      expect(result.current.isProcessing).toBe(false);
    });
    expect(args.onRecordingError).not.toHaveBeenCalled();
  });

  it('自然終端要求の後は stopExport({ reason: "user" }) でも abort しない', async () => {
    mockGetPlatformCapabilities.mockReturnValue(
      createPlatformCapabilities({
        isIOS: true,
        isSafari: true,
        isIosSafari: true,
        supportsMp4MediaRecorder: true,
        supportedMediaRecorderProfile: {
          mimeType: 'video/mp4',
          extension: 'mp4',
        },
      }),
    );

    let capturedSignal: AbortSignal | null = null;
    let resolveStrategy: ((handled: boolean) => void) | null = null;
    mockRunIosSafariMediaRecorderStrategy.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<boolean>((resolve) => {
          capturedSignal = signal;
          resolveStrategy = resolve;
        }),
    );

    const { result } = renderHook(() => useAppleSafariExport());
    const args = createStartExportArgs();

    await act(async () => {
      result.current.startExport(
        args.canvasRef,
        args.masterDestRef,
        args.onRecordingStop,
        args.onRecordingError,
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.isProcessing).toBe(true);
    });

    act(() => {
      result.current.completeExport();
    });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.stopExport({ reason: 'user' });
    });

    if (!capturedSignal) {
      throw new Error('AbortSignal was not captured');
    }
    const signal = capturedSignal as AbortSignal;
    expect(signal.aborted).toBe(false);
    expect(args.onRecordingError).not.toHaveBeenCalled();

    await act(async () => {
      resolveStrategy?.(true);
      await Promise.resolve();
    });
    expect(args.onRecordingError).not.toHaveBeenCalled();
  });

  it('clearExportUrl は保持中の Blob URL を解放して state を空にする', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const { result } = renderHook(() => useStandardExport());

    act(() => {
      result.current.setExportUrl('blob:test-export');
      result.current.setExportExt('mp4');
    });

    act(() => {
      result.current.clearExportUrl();
    });

    expect(revokeSpy).toHaveBeenCalledWith('blob:test-export');
    expect(result.current.exportUrl).toBeNull();
    expect(result.current.exportExt).toBeNull();
  });

  it('startExport 開始時に前回の Blob URL を解放してから state を空にする', async () => {
    mockGetPlatformCapabilities.mockReturnValue(createPlatformCapabilities());
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useStandardExport());
    const args = createStartExportArgs();

    act(() => {
      result.current.setExportUrl('blob:previous-export');
      result.current.setExportExt('mp4');
    });

    await act(async () => {
      await result.current.startExport(
        args.canvasRef,
        args.masterDestRef,
        args.onRecordingStop,
        args.onRecordingError,
      );
    });

    expect(revokeSpy).toHaveBeenCalledWith('blob:previous-export');
    expect(result.current.exportUrl).toBeNull();
    expect(result.current.exportExt).toBeNull();
  });

  it('AudioTrack volume は export 前に 0..2.5 へ clamp する', () => {
    expect(clampAudioTrackVolume(-1)).toBe(0);
    expect(clampAudioTrackVolume(0)).toBe(0);
    expect(clampAudioTrackVolume(1.25)).toBe(1.25);
    expect(clampAudioTrackVolume(2.5)).toBe(2.5);
    expect(clampAudioTrackVolume(3)).toBe(2.5);
  });
});
