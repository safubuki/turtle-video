# iOS Safari 音声エクスポート修正レポート（引き継ぎ書）

**作成日**: 2026年2月8日  
**対象バージョン**: v3.0.5  
**ブランチ**: feature/fix-ios-exec  
**対応完了状況**: ✅ 実装完了・ビルド/テスト通過・実機検証待ち

---

## 0. 追補（2026年2月8日 / v3.0.6相当）

### 0.1 実機確認結果（今回）
- ✅ **動画単体プロジェクト**では、iOS Safari でエクスポート音声ありを確認
- ❌ **動画→静止画の混在プロジェクト**で、出力動画が無音化するケースを確認
- ❌ その後、ビュー再生時の音声不調が発生するケースを確認

### 0.2 追加で判明した原因（iOS Safari特有）
1. **MediaRecorder用の結合ストリーム停止処理が元音声トラックを停止していた**
   - 旧実装では `combined.getTracks().forEach(track.stop())` を実行
   - `combined` に `masterDest.stream` の**元AudioTrack**を直接入れていたため、停止時に元トラックまで `ended` 化
   - これにより後続エクスポート・再生系へ副作用が波及

2. **MediaRecorder を timeslice なしで開始していた**
   - `recorder.start()`（単一終端チャンク依存）だと、iOS Safari で終端条件（後半無音・トラック最適化）により音声チャンク取りこぼしが起きるケースがある

3. **iOS Safariの無音最適化対策が不足**
   - 動画→静止画の遷移で音声が途切れる構成は、Safari側の最適化を誘発しやすい

### 0.3 今回の対策（実装済み）
- `src/hooks/useExport.ts` の iOS Safari MediaRecorder 経路を修正
1. **録画用AudioTrackを clone 化**
   - `masterDest.stream` の元トラックは停止せず、`track.clone()` を録画用に利用
   - cleanup 時は clone のみ停止

2. **cleanup対象を限定**
   - 停止対象を「録画用 canvas track + clone audio track」に限定
   - 元 `masterDest` のトラックを停止しない

3. **keep-alive 微小音を追加**
   - 録画中のみ `OscillatorNode -> Gain(0.00001) -> masterDest` を接続
   - iOS Safari の無音最適化でオーディオ経路が止まるのを抑制

4. **MediaRecorder を timeslice 付きで開始**
   - `recorder.start(1000)` に変更し、1秒ごとにチャンク化
   - `abort` 時に `requestData()` を試行してから `stop()`

5. **フォールバック戦略は維持**
   - MediaRecorder 経路が使えない場合は既存 WebCodecs 経路へフォールバック

### 0.4 なぜ従来対応で解決しきれなかったか
- 従来は `decodeAudioData` / WebCodecs / OfflineAudioContext 側の解析に主軸があり、**MediaRecorder経路のトラックライフサイクル副作用**が未特定だった
- 単体動画テストでは通るため、**「動画→静止画」混在 + 連続実行**でのみ顕在化する問題が埋もれていた
- 「処理成功時に stop している対象が共有トラックか否か」の監査が不足していた

### 0.5 不要対応の整理（慎重削除方針）
- 削除済み（実質）：`combined` 経由で元トラックを停止する危険処理
- 維持（意図的）：
  - WebCodecs + OfflineAudioContext + `extractAudioViaVideoElement()` 系は、MediaRecorder 非対応/失敗時の保険として保持
  - 既存 Android/PC 動線への影響回避を優先

### 0.6 今後Safari対応で必ず守ること
1. 録画用 `MediaStream` には **clone track** を使い、元トラックを直接 stop しない
2. cleanup は「この処理で生成したリソースだけ」を停止する（所有権を明確化）
3. iOS Safari では timeslice 付き録画と keep-alive を標準採用する
4. テストケースに必ず以下を含める
   - 動画単体
   - 動画→静止画
   - 静止画→動画
   - 連続2回以上のエクスポート
   - エクスポート後のビュー再生音声確認
5. ログには track の `readyState` と chunk 数を必ず残す

---

## 1. 問題の背景

### 1.1 初期状態
- **症状**: iOS Safari でMP4エクスポートを実行すると、ダウンロードされた動画ファイルの音声が完全に無音
- **影響範囲**: iPhone iOS 18.7, Safari 26.2（PCブラウザ・Android Chrome では正常動作）
- **検証環境**: sampleRate 48000Hz, BGM: video_bgm.mp3, Narration: video_narration.mp3, Clip: test4.mov
- **プロジェクト総尺**: 5.841秒

### 1.2 当初の音声パイプライン（v3.0.0以前）
```
MediaElement → MediaElementAudioSourceNode 
             → ScriptProcessorNode (4096 buffer)
             → リアルタイムPCMキャプチャ 
             → AudioEncoder (AAC-LC, 48kHz, 128kbps)
             → mp4-muxer
```

この方式は以下の問題を抱えていた：
- リアルタイムキャプチャのため、ビデオエンコードとの厳密な同期が必要
- iOS Safari で音声が無音化（原因不明）

---

## 2. 試行錯誤の履歴

### Attempt 1: CORS対策（v3.0.0）
**仮説**: オーディオ要素のCORS制約が原因  
**実装**: `audio.crossOrigin = 'anonymous'` を追加  
**結果**: ❌ 効果なし（音声依然として無音）  
**学び**: CORS は原因ではなかった

---

### Attempt 2: Keep-Alive音声出力による強制アクティブ化（v3.0.1）
**仮説**: iOS Safari がバックグラウンドで AudioContext の音声処理を停止している  
**実装**:
- エクスポート中も `exportMixerNodeRef` を `ctx.destination` に接続
- スピーカー出力を維持することで AudioContext を強制的にアクティブ化

**結果**: ❌ スピーカー出力は正常（エクスポート中にBGM/ナレーションが聞こえる）、しかしファイルは無音  
**学び**: AudioContext 自体は正常動作している。問題は AudioEncoder または mp4-muxer への音声データ供給パス

---

### Attempt 3: 直接ScriptProcessorNode方式への回帰（v3.0.1）
**仮説**: エクスポート用のミキサーノードが原因  
**実装**: `exportMixerNodeRef` を削除し、`masterDestRef` から直接 ScriptProcessor に接続  
**結果**: ❌ 音声依然として無音  
**学び**: ノード構成の問題ではない

---

### Attempt 4: OfflineAudioContext + f32 interleaved（v3.0.2）
**仮説**: リアルタイム処理が不安定。事前レンダリングで解決  
**実装**:
- `OfflineAudioContext` で全音声をプリレンダリング
- `offlineRenderAudio()` 関数で全ソースをタイムライン通りミックス
- `offlineCtx.decodeAudioData()` でメディアファイルをデコード
- レンダリング済み AudioBuffer を `f32` interleaved 形式で AudioData に変換
- AudioEncoder に直接供給（ScriptProcessorNode 完全排除）

**結果**: ❌ 音声依然として無音  
**エラーログなし**: この時点では診断ログが不足しており、原因特定できず  
**学び**: OfflineAudioContext 自体は動作したが、音声データが空だった（後の診断で判明）

---

### Attempt 5: mainCtx.decodeAudioData + f32-planar（v3.0.2）
**仮説**: OfflineAudioContext の decodeAudioData が iOS Safari で不安定  
**実装**:
- メイン AudioContext で `decodeAudioData()` を実行
- AudioBuffer を `f32-planar` 形式に変更（iOS Safari AudioEncoder のネイティブ形式）
- 詳細な診断ログ追加（DIAG-1 ~ DIAG-9）

**結果**: ❌ 音声依然として無音  
**重要な発見**: 診断ログにより以下が判明
```
[DIAG-DECODE] 音声デコード失敗 
error: "Decoding failed"
errorName: "EncodingError"
source: test4.mov (type: video)
```

**根本原因確定**: **iOS Safari の `decodeAudioData()` はビデオコンテナフォーマット(.mov/.mp4)をデコードできない**
- 音声専用ファイル(.mp3/.m4a)は正常にデコード可能
- ビデオファイルの音声トラックは `EncodingError: Decoding failed` で失敗
- デコード失敗 → 0 sources scheduled → AudioEncoder 出力 0 bytes → 無音動画

---

### Attempt 6: extractAudioViaVideoElement フォールバック（v3.0.3）
**仮説**: `<video>` 要素経由なら iOS Safari でもデコード可能  
**実装**:
```typescript
async function extractAudioViaVideoElement(
  blob: Blob, 
  ctx: AudioContext, 
  signal: AbortSignal
): Promise<AudioBuffer>
```
1. `URL.createObjectURL(blob)` で一時URL作成
2. `<video>` 要素を生成し、src に設定
3. `MediaElementAudioSourceNode` → `ScriptProcessorNode` で接続
4. video.play() でリアルタイム再生しながら PCM データをキャプチャ
5. キャプチャデータから AudioBuffer を生成

**フォールバック戦略**:
- `decodeAudioData()` が失敗した場合のみ `extractAudioViaVideoElement()` を実行
- 音声専用ファイル(.mp3等)は高速な `decodeAudioData()` を使用
- ビデオファイルのみリアルタイム抽出（動画の長さと同じ時間がかかる）

**結果**: ❌ ダウンロードボタンが表示されない  
**新たな問題**: 
- `startEngine()` で `loop()` と `startWebCodecsExport()` を同時に開始
- `extractAudioViaVideoElement()` が ~6秒かかる間に `loop()` が完走し `stopExport()` を呼び出す
- タイミング競合でエクスポートが中断

---

### Attempt 7: onAudioPreRenderComplete コールバック（v3.0.4）
**仮説**: ビデオキャプチャ開始を音声抽出完了後まで遅延させる  
**実装**:
```typescript
interface ExportAudioSources {
  mediaItems: MediaItem[];
  bgm: AudioTrack | null;
  narration: AudioTrack | null;
  totalDuration: number;
  onAudioPreRenderComplete?: () => void; // 追加
}
```

**TurtleVideo.tsx の変更**:
```typescript
// Before (v3.0.3):
startWebCodecsExport(...);
loop(isExportMode, myLoopId); // 並列実行

// After (v3.0.4):
startWebCodecsExport(..., {
  onAudioPreRenderComplete: () => {
    loop(isExportMode, myLoopId); // コールバック内で実行
  }
});
```

**結果**: ❌ スライダーが0の位置のまま動かず、0秒の動画が生成される  
**新たな問題**:
```typescript
// startEngine (line ~1657):
startTimeRef.current = Date.now() - fromTime * 1000; // T+0 で設定

// ~6秒後に onAudioPreRenderComplete 発火
onAudioPreRenderComplete: () => {
  loop(isExportMode, myLoopId); // T+6 で開始
}

// loop (line 1463):
const elapsed = (Date.now() - startTimeRef.current) / 1000; // = 6秒
if (elapsed >= totalDurationRef.current) { // 6 >= 5.9 → true
  stopAll(); // 即座に終了
  return;
}
```

**問題の仕組み**: `startTimeRef` が古いまま残っているため、ループが即座に終了条件を満たす → 0フレームキャプチャ → 0秒動画

---

### Attempt 8: startTimeRef リセット（v3.0.5） ✅
**実装**:
```typescript
onAudioPreRenderComplete: () => {
  startTimeRef.current = Date.now() - fromTime * 1000; // リセット
  loop(isExportMode, myLoopId);
}
```

**結果**: ✅ ビルド・テスト通過（93/93）  
**期待される動作**:
- リアルタイム音声抽出完了後に `startTimeRef` をリセット
- `loop()` は `elapsed=0` から正常にカウント開始
- スライダーが0→100%まで進む
- 動画の全フレームがキャプチャされる
- AudioEncoder は既に音声データを保持（抽出済み）
- mp4-muxer が正常な動画を出力

**実機検証待ち**: iPhone iOS 18.7, Safari 26.2 で実際にエクスポートして音声が含まれているか確認が必要

---

## 3. 技術的な根本原因まとめ

### 3.1 iOS Safari の制約
1. **`decodeAudioData()` がビデオコンテナをデコードできない**
   - `.mov`, `.mp4` のようなビデオコンテナ内の音声トラック → `EncodingError: Decoding failed`
   - `.mp3`, `.m4a`, `.wav` のような音声専用ファイル → 正常動作
   - 他のブラウザ（Chrome, Firefox, Desktop Safari）では `.mov/.mp4` も正常デコード可能

2. **リアルタイム音声抽出の時間コスト**
   - `extractAudioViaVideoElement()` は動画の長さと同じ時間がかかる（5.9秒の動画 = ~6秒の抽出時間）
   - この間、メインスレッドは他の処理を続行できる（非同期処理）

### 3.2 タイミング制御の必要性
- **問題**: 音声抽出とビデオキャプチャを並列実行すると競合
  - ビデオキャプチャが先に完了 → `stopExport()` 呼び出し → 音声抽出が途中で中断
  - または、音声が未準備のまま AudioEncoder に空データが供給される

- **解決策**: `onAudioPreRenderComplete` コールバックで逐次実行を保証
  1. 音声プリレンダリング（OfflineAudioContext ミックス + extractAudioViaVideoElement フォールバック）
  2. AudioEncoder への音声データ供給完了
  3. コールバック発火
  4. ビデオキャプチャ開始（`loop()` 実行）

- **startTimeRef の役割**:
  - `loop()` 内で経過時間を計算: `elapsed = (Date.now() - startTimeRef.current) / 1000`
  - `elapsed >= totalDuration` で終了判定
  - 音声抽出に費やした時間分だけ `startTimeRef` が古くなる → リセットが必要

---

## 4. 最終的な実装（v3.0.5）

### 4.1 アーキテクチャ

```
【音声パイプライン】
Step 1: 音声プリレンダリング
  MediaItem(.mov/.mp4/.mp3) 
    → decodeAudioData() ← iOS Safari でビデオは失敗
    → [失敗時] extractAudioViaVideoElement()
         → <video> 要素 → MediaElementAudioSourceNode 
         → ScriptProcessorNode → PCM キャプチャ
         → AudioBuffer 生成
    → OfflineAudioContext でタイムラインミックス
    → レンダリング済み AudioBuffer

Step 2: AudioEncoder への供給
  AudioBuffer (f32-planar)
    → AudioData チャンクに分割
    → AudioEncoder (AAC-LC, 48kHz, 128kbps)
    → EncodedAudioChunk
    → mp4-muxer

Step 3: コールバック発火
  onAudioPreRenderComplete() 
    → startTimeRef.current = Date.now()
    → loop() 開始

【ビデオパイプライン】
Step 4: ビデオキャプチャ（loop内）
  Canvas (renderFrame)
    → VideoFrame
    → VideoEncoder (H.264, 1280x720, 30fps, 5Mbps)
    → EncodedVideoChunk
    → mp4-muxer

Step 5: 完成
  mp4-muxer.finalize()
    → ArrayBuffer
    → Blob
    → URL.createObjectURL
    → ダウンロードリンク表示
```

### 4.2 主要関数

#### `extractAudioViaVideoElement()` (useExport.ts)
```typescript
async function extractAudioViaVideoElement(
  blob: Blob, 
  ctx: AudioContext, 
  signal: AbortSignal
): Promise<AudioBuffer>
```
- **目的**: ビデオコンテナから音声をリアルタイム抽出
- **処理時間**: 動画の長さと同等
- **使用タイミング**: `decodeAudioData()` が失敗した場合のみ（自動フォールバック）

#### `offlineRenderAudio()` (useExport.ts)
```typescript
async function offlineRenderAudio(
  sources: ExportAudioSources,
  mainCtx: AudioContext,
  sampleRate: number,
  signal: AbortSignal
): Promise<AudioBuffer | null>
```
- **目的**: 全音声ソースをタイムライン通りにミックス
- **内部処理**:
  1. 各ソースを `decodeAudioData()` でデコード（失敗時は `extractAudioViaVideoElement()` 自動呼び出し）
  2. OfflineAudioContext で GainNode + スケジューリング
  3. 音量・フェードイン/アウト適用
  4. `startRendering()` で完全なミックスダウン AudioBuffer 生成

#### `feedPreRenderedAudio()` (useExport.ts)
```typescript
function feedPreRenderedAudio(
  audioBuffer: AudioBuffer,
  encoder: AudioEncoder,
  sampleRate: number
): number
```
- **目的**: AudioBuffer を `f32-planar` AudioData に変換し AudioEncoder に供給
- **返り値**: エンコードされたチャンク数（診断用）

#### `startEngine()` (TurtleVideo.tsx, line ~1480)
```typescript
const startEngine = useCallback(async (fromTime: number, isExportMode: boolean) => {
  // ... メディア準備 ...
  startTimeRef.current = Date.now() - fromTime * 1000; // ← 最初の設定
  
  if (isExportMode) {
    startWebCodecsExport(..., {
      onAudioPreRenderComplete: () => {
        startTimeRef.current = Date.now() - fromTime * 1000; // ← リセット
        loop(isExportMode, myLoopId);
      }
    });
  } else {
    loop(isExportMode, myLoopId);
  }
}, [...]);
```

#### `loop()` (TurtleVideo.tsx, line 1440)
```typescript
const loop = useCallback((isExportMode: boolean, myLoopId: number) => {
  if (myLoopId !== loopIdRef.current) return;
  const elapsed = (Date.now() - startTimeRef.current) / 1000;
  if (elapsed >= totalDurationRef.current) {
    stopAll();
    return;
  }
  setCurrentTime(elapsed);
  renderFrame(elapsed, true, isExportMode);
  requestAnimationFrame(() => loop(isExportMode, myLoopId));
}, [...]);
```

---

## 5. 検証が必要な事項

### 5.1 実機検証（最優先）
- [ ] iPhone iOS 18.7, Safari 26.2 でエクスポート実行
- [ ] ダウンロードボタンが表示されるか
- [ ] スライダーが 0% → 100% まで進行するか
- [ ] ダウンロードした動画に音声が含まれているか
- [ ] BGM・ナレーション・クリップ音声が正常に聞こえるか
- [ ] 音量・フェード設定が反映されているか

### 5.2 パフォーマンス検証
- [ ] 長尺動画（30秒以上）でリアルタイム抽出の挙動
- [ ] 複数のビデオクリップを含むプロジェクトでの動作
- [ ] メモリ使用量（OfflineAudioContext + extractAudioViaVideoElement の同時実行）

### 5.3 エッジケース
- [ ] BGMのみ（ナレーションなし）のプロジェクト
- [ ] ナレーションのみ（BGMなし）のプロジェクト
- [ ] 音声トラックを持たないビデオクリップのみのプロジェクト
- [ ] 画像クリップ + BGM のプロジェクト
- [ ] 非常に短い動画（<1秒）
- [ ] `decodeAudioData()` が成功するケース（.mp3 BGM等）でもコールバックが正常動作するか

---

## 6. 次のAIが知っておくべき技術情報

### 6.1 診断ログの見方
iOS Safari でエクスポートを実行すると、以下のログが出力される：

```
[DIAG-1] OfflineAudioContextレンダリング開始
[DIAG-DECODE] 音声デコード成功/失敗 ← ここで失敗が出る
[DIAG-EXTRACT] extractAudioViaVideoElement開始 ← フォールバック発動
[DIAG-2] レンダリング完了 {duration: 5.9, maxAmplitude: 0.42}
[DIAG-SCHED] スケジュール済みソース数: 3
[DIAG-3] AudioData変換開始
[DIAG-ENC-OUT] AudioEncoderチャンク出力: 303 chunks, 1818 bytes
[DIAG-READY] 音声プリレンダリング完了
```

- `maxAmplitude: 0` → 音声データが空（デコード全失敗）
- `maxAmplitude: 0.3~0.8` → 音声データあり（正常）
- `scheduledSources: 0` → 有効な音声ソースなし
- `AudioEncoderチャンク出力: 0 chunks` → エンコード失敗

### 6.2 ファイル構成
- **useExport.ts** (~1352行): WebCodecs エクスポートロジック
  - `extractAudioViaVideoElement()`: line ~180
  - `offlineRenderAudio()`: line ~300
  - `feedPreRenderedAudio()`: line ~600
  - `startExport()`: line ~800

- **TurtleVideo.tsx** (~2272行): メインコンポーネント
  - `loop()`: line 1440
  - `startEngine()`: line 1480
  - `onAudioPreRenderComplete` コールバック: line 1682

- **implementation-patterns.md**: 実装パターン集（このissueを含む全ての注意事項を網羅）

### 6.3 iOS Safari 特有の制約一覧
1. `decodeAudioData()` はビデオコンテナ非対応
2. AudioContext の sampleRate は 48000Hz 固定（他のレートは自動リサンプリング）
3. `ScriptProcessorNode` は非推奨だが AudioWorklet は一部環境で不安定（本プロジェクトでは ScriptProcessor を継続使用）
4. Canvas の `toBlob()` で webp が使えない（png/jpeg のみ）
5. WebCodecs の VideoEncoder は H.264 のみサポート（VP9/AV1 非対応）

### 6.4 絶対に変更してはいけない実装
- `f32-planar` 形式（iOS Safari AudioEncoder との互換性のため）
- `onAudioPreRenderComplete` コールバック内の `startTimeRef` リセット
- `extractAudioViaVideoElement()` のフォールバック機構
- MediaResourceLoader.tsx の `opacity: 0.001`（display: none は使わない）
- OfflineAudioContext の音量・フェード計算ロジック（按分クランプ含む）

---

## 7. もし音声が出ない場合のデバッグ手順

1. **診断ログを確認**
   - `[DIAG-DECODE]` で全ソースが失敗していないか
   - `maxAmplitude` が 0 になっていないか
   - `AudioEncoderチャンク出力` が 0 chunks でないか

2. **音声ファイルの形式を確認**
   - BGM/ナレーションが .mp3 や .m4a なら `decodeAudioData()` が成功するはず
   - ビデオクリップが .mov/.mp4 なら `extractAudioViaVideoElement()` が動作するはず

3. **タイミング問題の確認**
   - `onAudioPreRenderComplete` が呼ばれているか（ログに `[DIAG-READY]` が出ているか）
   - `loop()` が実行されているか（スライダーが動いているか）
   - `elapsed >= totalDuration` で即座に終了していないか

4. **AudioEncoder の状態確認**
   - EncodedAudioChunk が mp4-muxer に渡されているか
   - muxer の `addAudioChunk()` でエラーが出ていないか

5. **最後の手段: 旧方式へのフォールバック**
   - OfflineAudioContext を無効化し、ScriptProcessorNode 方式に戻す
   - ただし iOS Safari では音声が出ない問題は未解決のまま

---

## 8. 今後の改善案（優先度低）

1. **AudioWorklet への移行検討**
   - ScriptProcessorNode は非推奨（ただし iOS Safari で安定動作する保証なし）
   - まずは現行実装で安定性を確認してから検討

2. **プログレス表示の改善**
   - リアルタイム音声抽出中（~6秒）の進捗インジケータ
   - 「音声を準備中...」のような UI メッセージ

3. **キャンセル機能の強化**
   - 音声抽出中のキャンセルボタン
   - AbortSignal の適切な伝播

4. **エラーハンドリングの強化**
   - `extractAudioViaVideoElement()` が失敗した場合のリトライ
   - タイムアウト処理（30秒以上かかる場合は中断）

5. **パフォーマンス最適化**
   - OfflineAudioContext のレンダリングを Web Worker で実行
   - 音声プリレンダリングとビデオプリロードの並列化

---

## 9. 参考資料

- [MDN: decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData)
- [WebCodecs API](https://www.w3.org/TR/webcodecs/)
- [mp4-muxer GitHub](https://github.com/Vanilagy/mp4-muxer)
- [iOS Safari Audio Limitations (Stack Overflow)](https://stackoverflow.com/questions/tagged/ios+safari+audio)
- 本プロジェクトの実装パターン集: `.github/skills/turtle-video-overview/references/implementation-patterns.md`

---

## 10. 連絡事項

**実装者**: GitHub Copilot (Claude Sonnet 4.5)  
**実装日**: 2026年2月8日  
**最終ビルド**: ✅ PASS (tsc + vite build)  
**最終テスト**: ✅ 93/93 PASS (vitest run)  
**実機検証**: ⏳ 未実施（次の担当者が実施してください）

**重要**: このレポートで説明した全ての技術的背景・注意事項は `.github/skills/turtle-video-overview/references/implementation-patterns.md` にも記載されています。新たな修正を加える前に必ず確認してください。
