/**
 * @file webcodecs.d.ts
 * @author Turtle Village
 * @description WebCodecs APIおよび関連する実験的APIのための型定義拡張。
 */
// WebCodecs API types

interface MediaStreamTrackProcessorInit {
    track: MediaStreamTrack;
    maxBufferSize?: number;
}

declare class MediaStreamTrackProcessor<T> {
    constructor(init: MediaStreamTrackProcessorInit);
    readonly readable: ReadableStream<T>;
}

interface VideoFrameInit {
    timestamp: number;
    duration?: number;
}

interface VideoFrame {
    readonly timestamp: number; // microseconds
    readonly duration: number | null;
    readonly codedWidth: number;
    readonly codedHeight: number;
    readonly colorSpace: VideoColorSpace;
    close(): void;
    clone(): VideoFrame;
}

declare var VideoFrame: {
    prototype: VideoFrame;
    new(image: CanvasImageSource | VideoFrame, init: VideoFrameInit): VideoFrame;
};

interface AudioDataInit {
    timestamp: number;
    data: BufferSource;
    numberOfChannels: number;
    numberOfFrames: number;
    sampleRate: number;
    format: AudioSampleFormat;
    transfer: ArrayBuffer[];
}

interface AudioData {
    readonly format: AudioSampleFormat;
    readonly sampleRate: number;
    readonly numberOfFrames: number;
    readonly numberOfChannels: number;
    readonly duration: number;
    readonly timestamp: number; // microseconds
    allocationSize(options: AudioDataCopyToOptions): number;
    copyTo(destination: BufferSource, options: AudioDataCopyToOptions): void;
    clone(): AudioData;
    close(): void;
}

declare var AudioData: {
    prototype: AudioData;
    new(init: AudioDataInit): AudioData;
};

// 念のためVideoEncoder/AudioEncoderも
interface VideoEncoderInit {
    output: (chunk: EncodedVideoChunk, metadata: EncodedVideoChunkMetadata) => void;
    error: (error: DOMException) => void;
}

declare class VideoEncoder {
    constructor(init: VideoEncoderInit);
    state: "configured" | "unconfigured" | "closed";
    /** 未処理のエンコード要求数。バックプレッシャー制御に使う */
    readonly encodeQueueSize: number;
    ondequeue: ((this: VideoEncoder, ev: Event) => void) | null;
    configure(config: VideoEncoderConfig): void;
    encode(frame: VideoFrame, options?: VideoEncoderEncodeOptions): void;
    flush(): Promise<void>;
    reset(): void;
    close(): void;
    addEventListener(type: 'dequeue', listener: (ev: Event) => void, options?: boolean | AddEventListenerOptions): void;
    removeEventListener(type: 'dequeue', listener: (ev: Event) => void, options?: boolean | EventListenerOptions): void;
    static isConfigSupported(config: VideoEncoderConfig): Promise<VideoEncoderSupport>;
}

interface AudioEncoderInit {
    output: (chunk: EncodedAudioChunk, metadata: EncodedAudioChunkMetadata) => void;
    error: (error: DOMException) => void;
}

declare class AudioEncoder {
    constructor(init: AudioEncoderInit);
    state: "configured" | "unconfigured" | "closed";
    configure(config: AudioEncoderConfig): void;
    encode(data: AudioData): void;
    flush(): Promise<void>;
    reset(): void;
    close(): void;
    static isConfigSupported(config: AudioEncoderConfig): Promise<AudioEncoderSupport>;
}
