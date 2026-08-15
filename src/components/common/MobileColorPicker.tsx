import React, { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDisableBodyScroll } from '../../hooks/useDisableBodyScroll';

interface HsvColor {
  h: number;
  s: number;
  v: number;
}

interface MobileColorPickerProps {
  label: string;
  value: string;
  onCancel: () => void;
  onConfirm: (color: string) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function hexToHsv(hex: string): HsvColor {
  const compact = hex.replace('#', '');
  const r = Number.parseInt(compact.slice(0, 2), 16) / 255;
  const g = Number.parseInt(compact.slice(2, 4), 16) / 255;
  const b = Number.parseInt(compact.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }

  return {
    h: h < 0 ? h + 360 : h,
    s: max === 0 ? 0 : (delta / max) * 100,
    v: max * 100,
  };
}

export function hsvToHex({ h, s, v }: HsvColor): string {
  const normalizedHue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 100) / 100;
  const value = clamp(v, 0, 100) / 100;
  const chroma = value * saturation;
  const hueSection = normalizedHue / 60;
  const intermediate = chroma * (1 - Math.abs((hueSection % 2) - 1));

  let r = 0;
  let g = 0;
  let b = 0;
  if (hueSection < 1) [r, g, b] = [chroma, intermediate, 0];
  else if (hueSection < 2) [r, g, b] = [intermediate, chroma, 0];
  else if (hueSection < 3) [r, g, b] = [0, chroma, intermediate];
  else if (hueSection < 4) [r, g, b] = [0, intermediate, chroma];
  else if (hueSection < 5) [r, g, b] = [intermediate, 0, chroma];
  else [r, g, b] = [chroma, 0, intermediate];

  const offset = value - chroma;
  const channel = (component: number) => Math.round((component + offset) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function getMobilePickerInitialHsv(hex: string): HsvColor {
  const current = hexToHsv(hex);

  // 黒・グレー・極端に暗い色は、OS 標準ピッカーでは色相と彩度の帯まで
  // 黒くなってしまう。現在色は保持したまま、選択候補だけを鮮やかな状態から始める。
  if (current.s <= 1 || current.v <= 10) {
    return { h: current.h, s: 100, v: 100 };
  }
  return current;
}

type SliderStyle = React.CSSProperties & { '--color-picker-gradient': string };

const sliderStyle = (gradient: string): SliderStyle => ({
  '--color-picker-gradient': gradient,
});

const MobileColorPicker: React.FC<MobileColorPickerProps> = ({
  label,
  value,
  onCancel,
  onConfirm,
}) => {
  const titleId = useId();
  const initialHsv = useMemo(() => getMobilePickerInitialHsv(value), [value]);
  const [hsv, setHsv] = useState(initialHsv);
  const selectedColor = hsvToHex(hsv);
  const currentHsv = useMemo(() => hexToHsv(value), [value]);
  const startsFromVividColor = currentHsv.s <= 1 || currentHsv.v <= 10;

  useDisableBodyScroll(true);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const saturationEnd = hsvToHex({ h: hsv.h, s: 100, v: 100 });
  const valueEnd = hsvToHex({ h: hsv.h, s: hsv.s, v: 100 });

  return createPortal(
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-2xl border border-gray-600 bg-gray-900 p-5 text-gray-100 shadow-2xl"
      >
        <h2 id={titleId} className="text-lg font-semibold">{label}を選択</h2>

        <div className="mt-5 space-y-4">
          <label className="block space-y-2 text-sm">
            <span className="flex justify-between"><span>色調</span><span>{Math.round(hsv.h)}°</span></span>
            <input
              type="range"
              min={0}
              max={359}
              value={hsv.h}
              onChange={(event) => setHsv((current) => ({
                ...current,
                h: Number(event.target.value),
              }))}
              aria-label={`${label}の色調`}
              className="mobile-color-picker-slider w-full"
              style={sliderStyle('linear-gradient(to right, #FF0000 0%, #FFFF00 16.67%, #00FF00 33.33%, #00FFFF 50%, #0000FF 66.67%, #FF00FF 83.33%, #FF0000 100%)')}
            />
          </label>

          <label className="block space-y-2 text-sm">
            <span className="flex justify-between"><span>彩度</span><span>{Math.round(hsv.s)}%</span></span>
            <input
              type="range"
              min={0}
              max={100}
              value={hsv.s}
              onChange={(event) => setHsv((current) => ({
                ...current,
                s: Number(event.target.value),
              }))}
              aria-label={`${label}の彩度`}
              className="mobile-color-picker-slider w-full"
              style={sliderStyle(`linear-gradient(to right, #FFFFFF, ${saturationEnd})`)}
            />
          </label>

          <label className="block space-y-2 text-sm">
            <span className="flex justify-between"><span>値（明るさ）</span><span>{Math.round(hsv.v)}%</span></span>
            <input
              type="range"
              min={0}
              max={100}
              value={hsv.v}
              onChange={(event) => setHsv((current) => ({
                ...current,
                v: Number(event.target.value),
              }))}
              aria-label={`${label}の値`}
              className="mobile-color-picker-slider w-full"
              style={sliderStyle(`linear-gradient(to right, #000000, ${valueEnd})`)}
            />
          </label>
        </div>

        {startsFromVividColor && (
          <p className="mt-4 rounded-lg bg-blue-950/60 px-3 py-2 text-xs leading-relaxed text-blue-200">
            黒や無彩色からも選びやすいよう、候補は彩度と明るさを上げて開始しています。
            現在の色は変更されていません。
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="mb-1 text-gray-400">現在</p>
            <div className="flex items-center gap-2">
              <span
                className="h-10 w-10 rounded-md border border-gray-500"
                style={{ backgroundColor: value }}
                aria-hidden="true"
              />
              <span className="font-mono">{value.toUpperCase()}</span>
            </div>
          </div>
          <div>
            <p className="mb-1 text-gray-400">選択中</p>
            <div className="flex items-center gap-2">
              <span
                className="h-10 w-10 rounded-md border border-gray-500"
                style={{ backgroundColor: selectedColor }}
                aria-hidden="true"
              />
              <span className="font-mono">{selectedColor}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-lg px-4 text-sm text-gray-300 hover:bg-gray-800"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedColor)}
            className="min-h-11 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-500"
          >
            設定
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default MobileColorPicker;
