/**
 * @file mediaColorRenderer.ts
 * @author Turtle Village
 * @copyright Copyright (C) 2026 safubuki (Turtle Village)
 * @license GPL-3.0-or-later
 * @description クリップの色合い（mediaColor.ts の色変換）を WebGL で掛けた描画元を作る。
 *
 * - 2D Canvas の `filter` は端末差（未対応・行列が使えない）があり、getImageData の画素処理は
 *   1080p 書き出しでは重すぎるため、共有の WebGL キャンバス 1 枚でシェーダを通す。
 * - 戻り値のキャンバスは次の呼び出しで上書きされる。呼び出し側は受け取った直後に drawImage する
 *   （ディゾルブ・2 画面表示で同じフレームに 2 枚描く場合も、描く直前に作れば問題ない）。
 * - WebGL が使えない・コンテキストが失われた・転送に失敗したときは素材をそのまま返す
 *   （色が変わらないだけで、描画は止めない）。
 */
import type { ResolvedMediaColorGrade } from './mediaColor';
import { LUMA_WEIGHTS } from './mediaColor';

/** 作業キャンバスの長辺の上限（4K 素材でも GPU メモリを使いすぎない） */
const MAX_WORK_LONG_SIDE = 3840;

const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = vec2((aPosition.x + 1.0) * 0.5, (1.0 - aPosition.y) * 0.5);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// mediaColor.ts の applyMediaColorGradeToRgb() と同じ式・同じ順序（個別 → 全体の 2 段重ね掛け対応）
const FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTexture;
uniform mat3 uMatchMatrix;
uniform vec3 uMatchOffset;
uniform float uMatchStrength;
uniform vec3 uGain;
uniform float uGamma;
uniform float uContrast;
uniform float uSaturation;
uniform float uHasOverlay;
uniform vec3 uOverlayGain;
uniform float uOverlayGamma;
uniform float uOverlayContrast;
uniform float uOverlaySaturation;
varying vec2 vUv;

vec3 applyAdjustPass(vec3 c, vec3 gain, float gamma, float contrast, float saturation) {
  c = clamp(c * gain, 0.0, 1.0);
  if (gamma != 1.0) {
    c = pow(max(c, vec3(0.0)), vec3(gamma));
  }
  c = (c - 0.5) * contrast + 0.5;
  float luma = dot(c, vec3(${LUMA_WEIGHTS[0]}, ${LUMA_WEIGHTS[1]}, ${LUMA_WEIGHTS[2]}));
  c = mix(vec3(luma), c, saturation);
  return clamp(c, 0.0, 1.0);
}

void main() {
  vec4 texel = texture2D(uTexture, vUv);
  vec3 c = texel.rgb;
  vec3 matched = clamp(uMatchMatrix * c + uMatchOffset, 0.0, 1.0);
  c = mix(c, matched, uMatchStrength);
  c = applyAdjustPass(c, uGain, uGamma, uContrast, uSaturation);
  if (uHasOverlay > 0.5) {
    c = applyAdjustPass(c, uOverlayGain, uOverlayGamma, uOverlayContrast, uOverlaySaturation);
  }
  gl_FragColor = vec4(c, texel.a);
}
`;

interface ColorRendererState {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  texture: WebGLTexture;
  uniforms: {
    matchMatrix: WebGLUniformLocation | null;
    matchOffset: WebGLUniformLocation | null;
    matchStrength: WebGLUniformLocation | null;
    gain: WebGLUniformLocation | null;
    gamma: WebGLUniformLocation | null;
    contrast: WebGLUniformLocation | null;
    saturation: WebGLUniformLocation | null;
    hasOverlay: WebGLUniformLocation | null;
    overlayGain: WebGLUniformLocation | null;
    overlayGamma: WebGLUniformLocation | null;
    overlayContrast: WebGLUniformLocation | null;
    overlaySaturation: WebGLUniformLocation | null;
  };
}

let rendererState: ColorRendererState | null = null;
/** 初期化に失敗した環境では毎フレーム作り直さない */
let rendererUnavailable = false;
let hasWarnedFailure = false;

function warnOnce(message: string, error?: unknown): void {
  if (hasWarnedFailure) return;
  hasWarnedFailure = true;
  console.warn(`[mediaColor] ${message}`, error ?? '');
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    warnOnce('shader compile failed', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createRendererState(): ColorRendererState | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
      depth: false,
      stencil: false,
    }) as WebGLRenderingContext | null;
  } catch {
    gl = null;
  }
  if (!gl) return null;

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertexShader || !fragmentShader) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    warnOnce('program link failed', gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const positionLocation = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  if (!texture) return null;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // 2 のべき乗でない素材も扱えるよう、ミップマップ無し・端は引き伸ばし
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.uniform1i(gl.getUniformLocation(program, 'uTexture'), 0);

  const state: ColorRendererState = {
    canvas,
    gl,
    texture,
    uniforms: {
      matchMatrix: gl.getUniformLocation(program, 'uMatchMatrix'),
      matchOffset: gl.getUniformLocation(program, 'uMatchOffset'),
      matchStrength: gl.getUniformLocation(program, 'uMatchStrength'),
      gain: gl.getUniformLocation(program, 'uGain'),
      gamma: gl.getUniformLocation(program, 'uGamma'),
      contrast: gl.getUniformLocation(program, 'uContrast'),
      saturation: gl.getUniformLocation(program, 'uSaturation'),
      hasOverlay: gl.getUniformLocation(program, 'uHasOverlay'),
      overlayGain: gl.getUniformLocation(program, 'uOverlayGain'),
      overlayGamma: gl.getUniformLocation(program, 'uOverlayGamma'),
      overlayContrast: gl.getUniformLocation(program, 'uOverlayContrast'),
      overlaySaturation: gl.getUniformLocation(program, 'uOverlaySaturation'),
    },
  };

  // コンテキストが失われたら次の呼び出しで作り直す（タブ復帰・GPU リセット）
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    if (rendererState === state) rendererState = null;
  });
  return state;
}

function getRendererState(): ColorRendererState | null {
  if (rendererUnavailable) return null;
  if (rendererState && !rendererState.gl.isContextLost()) return rendererState;
  rendererState = null;
  try {
    rendererState = createRendererState();
  } catch (error) {
    warnOnce('WebGL init failed', error);
    rendererState = null;
  }
  if (!rendererState) {
    rendererUnavailable = true;
    warnOnce('WebGL is unavailable; color adjustments are skipped');
  }
  return rendererState;
}

/**
 * 作業キャンバスの大きさ。素材の解像度のまま作り（縮小は従来どおり 2D 側の drawImage に任せ、
 * 色を変えないクリップと同じ縮小画質にする）、長辺だけ上限で抑える。
 */
export function resolveColorWorkSize(
  sourceWidth: number,
  sourceHeight: number,
): { width: number; height: number } {
  const safeW = Math.max(1, Math.round(Number.isFinite(sourceWidth) ? sourceWidth : 1));
  const safeH = Math.max(1, Math.round(Number.isFinite(sourceHeight) ? sourceHeight : 1));
  const factor = Math.min(1, MAX_WORK_LONG_SIDE / Math.max(safeW, safeH));
  return {
    width: Math.max(1, Math.round(safeW * factor)),
    height: Math.max(1, Math.round(safeH * factor)),
  };
}

/**
 * 色合いを掛けた描画元を返す。grade が null（変更なし）なら素材をそのまま返す。
 * 返り値は `sourceWidth × sourceHeight` の大きさとして drawImage すればよい（縦横比は同じ）。
 */
export function prepareColorGradedSource(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  grade: ResolvedMediaColorGrade | null,
): CanvasImageSource {
  if (!grade || sourceWidth <= 0 || sourceHeight <= 0) return source;
  const state = getRendererState();
  if (!state) return source;
  const { gl, canvas, uniforms } = state;
  const { width, height } = resolveColorWorkSize(sourceWidth, sourceHeight);
  try {
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.bindTexture(gl.TEXTURE_2D, state.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
    // GLSL の mat3 は列優先。保存値（行優先）を転置して渡す
    const m = grade.matchMatrix;
    gl.uniformMatrix3fv(uniforms.matchMatrix, false, [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
    gl.uniform3fv(uniforms.matchOffset, grade.matchOffset);
    gl.uniform1f(uniforms.matchStrength, grade.matchStrength);
    gl.uniform3fv(uniforms.gain, grade.gain);
    gl.uniform1f(uniforms.gamma, grade.gamma);
    gl.uniform1f(uniforms.contrast, grade.contrast);
    gl.uniform1f(uniforms.saturation, grade.saturation);
    if (grade.overlay) {
      gl.uniform1f(uniforms.hasOverlay, 1);
      gl.uniform3fv(uniforms.overlayGain, grade.overlay.gain);
      gl.uniform1f(uniforms.overlayGamma, grade.overlay.gamma);
      gl.uniform1f(uniforms.overlayContrast, grade.overlay.contrast);
      gl.uniform1f(uniforms.overlaySaturation, grade.overlay.saturation);
    } else {
      gl.uniform1f(uniforms.hasOverlay, 0);
      gl.uniform3fv(uniforms.overlayGain, [1, 1, 1]);
      gl.uniform1f(uniforms.overlayGamma, 1);
      gl.uniform1f(uniforms.overlayContrast, 1);
      gl.uniform1f(uniforms.overlaySaturation, 1);
    }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // getError() は GPU との同期待ちになるため毎フレームは呼ばない
    if (gl.isContextLost()) return source;
    return canvas;
  } catch (error) {
    // デコード前の video・壊れた画像など。今回は色を掛けずに描く
    warnOnce('color grading failed', error);
    return source;
  }
}

/** テスト用: 共有状態を初期化する */
export function resetMediaColorRendererForTest(): void {
  rendererState = null;
  rendererUnavailable = false;
  hasWarnedFailure = false;
}
