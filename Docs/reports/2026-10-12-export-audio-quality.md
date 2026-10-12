# BGM書き出しの音声品質調査

調査日: 2026-10-12（日本時間）  
対象: Turtle Video 6.0.3 / Git `7334931` / standard flavor（PC・Android共通）  
実測環境: Windows 11、Microsoft Edge 155（Playwrightの隔離されたheadlessセッション）

## 結論

**音声ファイル上の変化を確認した。今回のBGM単体・音量100%のサンプルでは、主な変化はAACへの再圧縮段階で発生した。** WAV/MP3のデコードとミックスまではほぼ保持されるが、現行のAAC-LC・128kbps出力では約15〜16kHz以上が大きく減り、音楽区間にも波形差が生じた。

同じミックス音声を192kbpsで出力すると、高域がより残り、音楽区間の波形誤差も減った。したがって、固定128kbpsの見直しは有力な改善候補である。ただし、測定結果だけでユーザーの感じる「ざらつき」の原因を確定したわけではない。Android実機での出力・スマホのスピーカーでの聴感は未検証。

アプリのソースは変更せず、実際のアプリ操作によるサンプル作成と比較実験を実施した。

## サンプルと聴き比べ

成果物は `.media-analysis-output/audio-quality-2026-10-12/` に保存。

- [聴き比べページ](../../.media-analysis-output/audio-quality-2026-10-12/listen.html): ブラウザで開く。元音声・現行128kbps・比較192kbpsの音楽区間10秒を同位置で切り替えられる。音量補正はしていない。
- [元WAV](../../.media-analysis-output/audio-quality-2026-10-12/sample-48k-stereo.wav) / [元MP3](../../.media-analysis-output/audio-quality-2026-10-12/sample-320k-stereo.mp3)
- [WAVからの現行MP4](../../.media-analysis-output/audio-quality-2026-10-12/export-wav.mp4) / [MP3からの現行MP4](../../.media-analysis-output/audio-quality-2026-10-12/export-mp3.mp4)
- [192kbpsの比較MP4](../../.media-analysis-output/audio-quality-2026-10-12/export-wav-192k.mp4) / [周波数の比較図](../../.media-analysis-output/audio-quality-2026-10-12/spectrum-source-aac128-aac192.png)

HTMLと音声・画像を同じフォルダに置いて開く。同じ端末、同じ音量、同じスピーカーまたはイヤホンで比較する。

## 実験条件と方法

16秒・48kHz・PCM16・ステレオ・ピーク約−3.50dBFSの決定的な音声を生成し、同じ内容から320kbps MP3も生成した。左右別の計測音、音楽風の音と高域の打楽器、18kHzまでのマルチトーンを含む。通常の楽曲を代表する品質評価用データではなく、処理段階と帯域を識別するための信号である。

640×360の静止画を16秒配置し、1280×720・30fpsのMP4を実際のタートルビデオから作成した。BGMは1本、音量100%、フェードOFF、音量揃えOFF、動画音声とナレーションなし。WAVとMP3をそれぞれ読み込み、圧縮前のOfflineAudioContext出力をfloat32 WAVとして採取した。

192kbps比較では、検証ブラウザ内だけでAudioEncoder.configureへのbitrateを差し替えた。元のアプリ設定は128kbpsであり、192kbpsは改修済みの機能ではない。128/192の圧縮前WAVはSHA-256も一致し、同じ音声を比較している。

FFmpeg 7.1で各ファイルをPCMへデコードし、相互相関で遅延を調整して比較した。MP4の音声トラックの圧縮サンプルサイズ合計と尺から実平均ビットレートを算出した。音声は768,000サンプル/チャンネル・16秒で一致し、今回の整数サンプル遅延は0。波形比較では一定の音量差を最小二乗で補正し、末尾0.1秒を比較対象から除外した。

## 観測結果

| 項目 | 現行WAV→AAC 128kbps | 比較WAV→AAC 192kbps |
|---|---:|---:|
| 実音声形式 | AAC-LC / 48kHz / 2ch | AAC-LC / 48kHz / 2ch |
| 音声圧縮データ量（16秒） | 256,000 bytes | 384,000 bytes |
| 実平均ビットレート | 128,000 bps | 192,000 bps |
| 完成MP4サイズ | 1,783,972 bytes | 1,911,972 bytes |
| 音楽区間のゲイン補正波形SNR | 18.84dB | 21.15dB |
| 全体の14〜18kHz帯パワー変化（ゲイン補正） | −3.79dB | −0.084dB |
| 18kHzの計測成分 | 大きく減衰 | 保持 |
| 100%条件の±1範囲超過 | なし | なし |

SNRは元の波形とどれだけ異なるかを測る指標で、聴感上の音質スコアではない。マルチトーンは高域損失を強調するため、通常音楽への説明では音楽区間を主に用いる。18kHzの成分消失だけで「ざらつき」を説明することもできない。

WAV→ミックスPCMはゲイン差約+0.00015dB・波形SNR96.37dBで、実質的に保持されていた。MP3→ミックスPCMも波形SNR122.77dBでほぼ一致した。MP3からの完成MP4もAAC-LC・48kHz・ステレオ・128kbpsとなり、ミックスPCM比の音楽区間SNRは21.06dB、100%条件の範囲超過はなかった。WAV実験とMP3実験は参照音声が異なるため、SNRの大小を入力形式の優劣と解釈しない。

100%条件では、ステレオのモノラル化、サンプルレート低下、振幅の範囲超過は確認されなかった。書き出しログも音声750チャンク・16秒、音声データあり、OfflineAudioContext使用、動画480フレーム・30fpsの正常完了を示した。ログの `audioEncoderClippedChunks` は時間範囲でのチャンク切り詰めを表すため、振幅の音割れ判定の根拠には用いていない。

## 別の歪み候補: 増幅・音源の重なり

通常のBGMミックスにはリミッターや最終ピーク正規化がない。追加のMP3・音量250%実験では、圧縮前音声のピークが+4.459dBFSとなり、全体の約0.721%のサンプルが±1を超えた。範囲超過は主にマルチトーン区間で、音楽区間ではごく少量だった。したがって、このサンプルで通常音楽の聴感上の音割れが再現したとまでは断定しない。

高い音量設定や動画音声・BGM・ナレーションの重なりによる振幅超過は、再圧縮とは別に調べるべき候補である。今回の100%サンプルには該当せず、ユーザーの実際のプロジェクトに該当するかは未確認。

## コード上の根拠

- `src/flavors/standard/export/exportEngine.ts:2415`: AAC-LC、2ch、bitrate 128000固定。WAVでもMP3でもデコードとミックスの後に再エンコードする。
- 同ファイル`:535`: OfflineAudioContextを2chで生成。`:1025`: BGMクリップ等はBufferSource→Gain→destinationへ接続。`:1212`: 左右別のPCMをAudioDataに渡す。
- `src/hooks/useAudioContext.ts:45`: AudioContextのサンプルレートを指定せず作成。出力レートは実端末のAudioContext値を引き継ぐ。今回の実値は48kHz。
- `src/stores/audioStore.ts:776`: 新規BGMクリップは100%。音量揃えは既定OFF。
- `src/utils/mediaVolume.ts:36`: 実効音量は音量と音量揃えゲインの積で、上限2.5。ミックス全体のピーク保証ではない。
- `src/hooks/export-strategies/exportStrategyResolver.ts:6`: 音源がある場合はOfflineAudioContext先行処理。負荷によるリアルタイム音声欠落は、今回使用した通常経路の主因候補ではない。

画質をFHDに変更しても、この固定音声bitrateを増やすコードにはなっていない。WAVへ入力形式を変更するだけでも、出力AAC128kbpsへの圧縮は残る。

## 改善案と未確認事項

優先候補は、PC/Androidの音声品質設定を設け、対応端末でAAC192kbps等を選択できるようにすること。今回の192kbps比較は、同じミックス入力で高域保持と波形誤差の改善を示した。128→192の音声容量増分は1分あたり約480kBで、全動画の増加率は映像条件によって異なる。

256kbpsを固定する案は、このPCでは使えなかった。実際に `NotSupportedError: Unsupported bitrate. Supported values: 96000, 128000, 160000, 192000` が発生し、isConfigSupportedも256/320kbpsにfalseを返した。Windows Media Foundation AACエンコーダの公式対応値も96/128/160/192kbpsである。[Microsoft AAC Encoder](https://learn.microsoft.com/en-us/windows/win32/medfound/aac-encoder)

実装するなら対応確認、実エンコードの失敗経路、128kbpsへのフォールバックを含める。WebCodecsは実装によって対応コーデックが異なるため、Android実機でも候補設定と完成ファイルを検証する。[W3C WebCodecs](https://www.w3.org/TR/webcodecs/#audio-encoder-config)

増幅時の対策は、ピーク超過を表示する診断、ミックス後のヘッドルーム調整、必要に応じたリミッター等を別に検討する。意図する音量や音の変化を伴うので、AACビットレートの改善とまとめて無検証で変更しない。

残る確認は、ユーザーが気になった元音声・完成MP4・音量設定での比較、実Android端末のエンコード結果、同じ再生端末での聴き比べ。スマホのスピーカー、再生アプリ、Bluetooth、投稿先での再圧縮等は今回切り分けていない。実測はローカルの現行コードであり、利用中の公開版のコードが同一かは確認していない。

## 証拠と再測定

フォルダ内の `browser-*.json` に実エンコーダ設定とアプリの診断ログ、`pre-render-*.wav` に圧縮前PCM、`comparison-*.json` に計測値、`sample-manifest.json` に生成条件を保存した。

比較スクリプトは自己参照で誤差0を確認。アプリのソース変更がないため、単体テストやビルドの追加実行は行っていない。実アプリ書き出し4本の音声と尺を検証し、聴き比べページの3音声が各10秒・メディアエラーなし、比較図も読み込めることをブラウザで確認した。

```powershell
.\.venv-media-analysis\Scripts\python.exe .media-analysis-output/audio-quality-2026-10-12/compare_audio.py --reference .media-analysis-output/audio-quality-2026-10-12/pre-render-wav.wav --target .media-analysis-output/audio-quality-2026-10-12/export-wav.mp4 --output .media-analysis-output/audio-quality-2026-10-12/recheck-128.json
```

成果物はローカル調査用のGit除外フォルダに保存されている。共有時はフォルダごとコピーする。
