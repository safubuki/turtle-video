import React, { useEffect, useState } from 'react';

export function parseCaptionHexColor(value: string): string | null {
  const compact = value.trim();
  const sixDigit = compact.match(/^#?([0-9a-f]{6})$/i);
  if (sixDigit) return `#${sixDigit[1].toUpperCase()}`;
  const threeDigit = compact.match(/^#?([0-9a-f]{3})$/i);
  if (!threeDigit) return null;
  const [r, g, b] = threeDigit[1].toUpperCase().split('');
  return `#${r}${r}${g}${g}${b}${b}`;
}

interface CaptionColorFieldProps {
  label: string;
  value: string;
  fallback: string;
  disabled?: boolean;
  idPrefix?: string;
  ariaLabelPrefix?: string;
  onChange: (color: string) => void;
}

const CaptionColorField = React.memo<CaptionColorFieldProps>(({
  label,
  value,
  fallback,
  disabled = false,
  idPrefix = 'caption',
  ariaLabelPrefix = 'キャプション',
  onChange,
}) => {
  const resolvedValue = parseCaptionHexColor(value) ?? fallback;
  const [draft, setDraft] = useState(resolvedValue);
  const isDraftValid = parseCaptionHexColor(draft) !== null;
  const colorInputId = `${idPrefix}-${label}-color`;

  useEffect(() => {
    setDraft(resolvedValue);
  }, [resolvedValue]);

  const commitDraft = () => {
    const parsed = parseCaptionHexColor(draft);
    if (parsed) {
      setDraft(parsed);
      onChange(parsed);
    } else {
      setDraft(resolvedValue);
    }
  };

  return (
    <div className="flex items-center gap-2 text-[10px] md:text-xs">
      <label className="text-gray-400 w-16 shrink-0" htmlFor={colorInputId}>
        {label}:
      </label>
      <input
        id={colorInputId}
        type="color"
        value={resolvedValue}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        disabled={disabled}
        aria-label={`${ariaLabelPrefix}の${label}`}
        className="h-8 w-11 shrink-0 cursor-pointer rounded-md border border-gray-600 bg-gray-700 p-0.5 disabled:cursor-default disabled:opacity-50"
      />
      <input
        type="text"
        value={draft}
        maxLength={7}
        inputMode="text"
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitDraft();
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            setDraft(resolvedValue);
            event.currentTarget.blur();
          }
        }}
        disabled={disabled}
        aria-label={`${ariaLabelPrefix}の${label}（16進数）`}
        aria-invalid={!isDraftValid}
        className={`min-w-0 flex-1 rounded-md border bg-gray-700 px-2 py-1.5 font-mono uppercase focus:outline-none focus:ring-1 disabled:opacity-50 ${isDraftValid
          ? 'border-gray-600 focus:border-yellow-500 focus:ring-yellow-500/40'
          : 'border-red-500 text-red-200 focus:ring-red-500/40'
          }`}
        placeholder={fallback}
      />
    </div>
  );
});

CaptionColorField.displayName = 'CaptionColorField';

export default CaptionColorField;
