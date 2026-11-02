'use client';

export interface ToastItem {
  id: number;
  message: string;
  kind?: 'info' | 'error';
}

export interface ToastViewportProps {
  toasts: ToastItem[];
}

const KIND_CLASS: Record<'info' | 'error', string> = {
  info: 'border-line bg-panel2 text-ink',
  error: 'border-[#ca3431]/60 bg-[#ca3431]/15 text-[#f0938f]',
};

export function ToastViewport({ toasts }: ToastViewportProps) {
  return (
    <div
      className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.kind === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto w-full rounded-base border px-3.5 py-2.5 text-sm font-medium shadow-xl ${KIND_CLASS[toast.kind ?? 'info']}`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

export default ToastViewport;
