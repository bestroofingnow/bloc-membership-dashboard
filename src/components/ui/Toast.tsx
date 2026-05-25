'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, X, Info } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  durationMs: number;
}

interface ToastContextValue {
  show: (message: string, opts?: { kind?: ToastKind; durationMs?: number }) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Soft-fail in test/server contexts: no-op shims keep callers from crashing.
    return {
      show: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
    } as ToastContextValue;
  }
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, opts?: { kind?: ToastKind; durationMs?: number }) => {
    const id = nextId++;
    const toast: Toast = {
      id,
      kind: opts?.kind ?? 'success',
      message,
      durationMs: opts?.durationMs ?? 3500,
    };
    setToasts((prev) => [...prev, toast]);
  }, []);

  const success = useCallback((m: string) => show(m, { kind: 'success' }), [show]);
  const error = useCallback((m: string) => show(m, { kind: 'error', durationMs: 6000 }), [show]);
  const info = useCallback((m: string) => show(m, { kind: 'info' }), [show]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show, success, error, info }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm no-print" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, toast.durationMs);
    return () => clearTimeout(id);
  }, [toast.durationMs, onDismiss]);

  const colors =
    toast.kind === 'success' ? 'border-green-200 bg-green-50 text-green-800' :
    toast.kind === 'error' ? 'border-red-200 bg-red-50 text-red-800' :
    'border-blue-200 bg-blue-50 text-blue-800';

  const Icon = toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertCircle : Info;

  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 shadow-sm ${colors}`} role="status">
      <Icon size={16} className="shrink-0 mt-0.5" />
      <div className="flex-1 text-sm">{toast.message}</div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-current opacity-60 hover:opacity-100"
      >
        <X size={14} />
      </button>
    </div>
  );
}
