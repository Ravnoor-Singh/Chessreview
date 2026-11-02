'use client';

/** Small shared form controls for the settings page (Themes & Presets). */

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-panel2 ring-1 ring-inset ring-line'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex max-w-full flex-wrap overflow-hidden rounded-lg ring-1 ring-line"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            value === opt.value ? 'bg-accent text-[#1c2b0d]' : 'bg-panel2 text-ink hover:bg-hover'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-2">
      <span className="min-w-0 text-sm text-ink">{label}</span>
      <span className="flex min-w-0 items-center">{children}</span>
    </div>
  );
}

export const SELECT_CLASS =
  'min-w-0 max-w-full rounded bg-panel2 px-2 py-1.5 text-sm text-ink ring-1 ring-line focus:outline-none focus:ring-accent';
