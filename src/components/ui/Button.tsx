'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    // Dark text on the brand green: white on #81b64c is only 2.41:1
    // contrast (axe color-contrast, Round 2 Prompt 5); #1d2b12 on the
    // same green is 6.21:1 and keeps the brand color unchanged.
    'bg-[#81b64c] text-[#1d2b12] border-b-4 border-[#5d8a35] hover:brightness-110 hover:-translate-y-px active:translate-y-0.5 active:border-b-0 disabled:hover:translate-y-0',
  secondary: 'bg-panel2 text-ink border border-line hover:bg-hover',
  ghost: 'bg-transparent text-ink hover:bg-hover',
  danger:
    'bg-[#ca3431] text-white border-b-4 border-[#932220] hover:brightness-110 hover:-translate-y-px active:translate-y-0.5 active:border-b-0 disabled:hover:translate-y-0',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3.5 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-base font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
      {...rest}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            className="opacity-25"
          />
          <path
            d="M22 12a10 10 0 0 0-10-10v4a6 6 0 0 1 6 6h4z"
            fill="currentColor"
            className="opacity-90"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
