export interface BrowserPlatformInfo {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  isIOS: boolean;
  isSafari: boolean;
  isIosSafari: boolean;
}

export interface MediaRecorderProfile {
  mimeType: string | null;
  extension: 'mp4' | 'webm';
}

export type TrackProcessorConstructor = new (init: { track: MediaStreamTrack }) => {
  readable: ReadableStream<VideoFrame | AudioData>;
};

type NavigatorLike = Partial<Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>>;

type MediaRecorderLike = {
  isTypeSupported: (mimeType: string) => boolean;
};

type PlatformWindowLike = {
  showSaveFilePicker?: unknown;
  MediaStreamTrackProcessor?: TrackProcessorConstructor;
};

export interface PlatformCapabilities extends BrowserPlatformInfo {
  supportsShowSaveFilePicker: boolean;
  supportsTrackProcessor: boolean;
  supportsMp4MediaRecorder: boolean;
  audioContextMayInterrupt: boolean;
  supportedMediaRecorderProfile: MediaRecorderProfile | null;
  trackProcessorCtor?: TrackProcessorConstructor;
}

const IOS_SAFARI_AUDIO_UPLOAD_ACCEPT =
  'audio/*,.mp3,.m4a,.wav,.aac,.flac,.ogg,.oga,.opus,.caf,.aif,.aiff,.mp4,.m4v,.mov,.webm';

const DEFAULT_AUDIO_UPLOAD_ACCEPT = 'audio/*';

function getDefaultNavigator(): NavigatorLike | undefined {
  return typeof navigator !== 'undefined' ? navigator : undefined;
}

function getDefaultWindow(): PlatformWindowLike | undefined {
  return typeof window !== 'undefined' ? (window as PlatformWindowLike) : undefined;
}

function getDefaultMediaRecorder(): MediaRecorderLike | undefined {
  return typeof MediaRecorder !== 'undefined' ? MediaRecorder : undefined;
}

export function detectBrowserPlatform(
  navigatorLike: NavigatorLike | undefined = getDefaultNavigator(),
): BrowserPlatformInfo {
  const userAgent = navigatorLike?.userAgent ?? '';
  const platform = navigatorLike?.platform ?? '';
  const maxTouchPoints = navigatorLike?.maxTouchPoints ?? 0;
  const isIOS = /iP(hone|ad|od)/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
  const isSafari = /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(userAgent);

  return {
    userAgent,
    platform,
    maxTouchPoints,
    isIOS,
    isSafari,
    isIosSafari: isIOS && isSafari,
  };
}

export function getAudioUploadAccept(platformInfo: BrowserPlatformInfo = detectBrowserPlatform()): string {
  return platformInfo.isIosSafari ? IOS_SAFARI_AUDIO_UPLOAD_ACCEPT : DEFAULT_AUDIO_UPLOAD_ACCEPT;
}

export function supportsShowSaveFilePicker(win: PlatformWindowLike | undefined = getDefaultWindow()): boolean {
  return typeof win?.showSaveFilePicker === 'function';
}

export function getTrackProcessorConstructor(
  win: PlatformWindowLike | undefined = getDefaultWindow(),
): TrackProcessorConstructor | undefined {
  const trackProcessorCtor = win?.MediaStreamTrackProcessor;
  return typeof trackProcessorCtor === 'function' ? trackProcessorCtor : undefined;
}

export function getSupportedMediaRecorderProfile(
  mediaRecorderLike: MediaRecorderLike | undefined = getDefaultMediaRecorder(),
): MediaRecorderProfile | null {
  if (!mediaRecorderLike) return null;

  const candidates: MediaRecorderProfile[] = [
    { mimeType: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"', extension: 'mp4' },
    { mimeType: 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/webm; codecs="vp8, opus"', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
  ];

  for (const candidate of candidates) {
    try {
      if (!candidate.mimeType || mediaRecorderLike.isTypeSupported(candidate.mimeType)) {
        return candidate;
      }
    } catch {
      // ignore and continue
    }
  }

  return null;
}

export function getPlatformCapabilities(options?: {
  navigator?: NavigatorLike;
  win?: PlatformWindowLike;
  mediaRecorder?: MediaRecorderLike;
}): PlatformCapabilities {
  const browser = detectBrowserPlatform(options?.navigator);
  const trackProcessorCtor = getTrackProcessorConstructor(options?.win);
  const supportedMediaRecorderProfile = getSupportedMediaRecorderProfile(options?.mediaRecorder);

  return {
    ...browser,
    supportsShowSaveFilePicker: supportsShowSaveFilePicker(options?.win),
    supportsTrackProcessor: !!trackProcessorCtor,
    supportsMp4MediaRecorder: supportedMediaRecorderProfile?.extension === 'mp4',
    audioContextMayInterrupt: browser.isIosSafari,
    supportedMediaRecorderProfile,
    trackProcessorCtor,
  };
}
