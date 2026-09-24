import React from 'react';
import NumericSliderField from './NumericSliderField';

interface PresetFadeDurationFieldProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  ariaLabel: string;
  accentClassName: string;
}

/** 0.5 / 1 / 2 秒だけを選べるフェード時間の共通入力。 */
const PresetFadeDurationField = React.memo<PresetFadeDurationFieldProps>(({
  value,
  onChange,
  disabled,
  ariaLabel,
  accentClassName,
}) => (
  <NumericSliderField
    min={0.5}
    max={2}
    step={0.5}
    value={value}
    onChange={(next) => onChange(next < 0.75 ? 0.5 : next < 1.5 ? 1 : 2)}
    resolveStep={(from, direction) => direction < 0
      ? (from > 1 ? 1 : 0.5)
      : (from < 1 ? 1 : 2)}
    disabled={disabled}
    ariaLabel={ariaLabel}
    unit="秒"
    className="min-w-0 flex-1"
    sliderClassName={`min-w-0 flex-1 h-1 rounded bg-gray-600 appearance-none disabled:opacity-50 ${accentClassName}`}
  />
));

PresetFadeDurationField.displayName = 'PresetFadeDurationField';

export default PresetFadeDurationField;
