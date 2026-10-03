"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import clsx from "clsx";

export type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; title: string; body?: string };

type ToastApi = {
  push: (t: { kind?: ToastKind; title: string; body?: string; durationMs?: number }) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback<ToastApi["push"]>(
    ({ kind = "info", title, body, durationMs }) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-3), { id, kind, title, body }]);
      setTimeout(() => dismiss(id), durationMs ?? (kind === "error" ? 9000 : 6000));
    },
    [dismiss]
  );
  const api = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => {
          const Icon = t.kind === "success" ? CheckCircle2 : t.kind === "error" ? AlertTriangle : Info;
          return (
            <div
              key={t.id}
              role={t.kind === "error" ? "alert" : "status"}
              className={clsx(
                "pointer-events-auto flex gap-3 rounded-lg border bg-surface p-3 shadow-lg",
                t.kind === "success" && "border-up/40",
                t.kind === "error" && "border-down/40",
                t.kind === "info" && "border-line"
              )}
            >
              <Icon
                size={18}
                aria-hidden="true"
                className={clsx("mt-0.5 shrink-0", t.kind === "success" && "text-up", t.kind === "error" && "text-down", t.kind === "info" && "text-teal-600")}
              />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-navy-900">{t.title}</p>
                {t.body ? <p className="mt-0.5 whitespace-pre-line text-muted">{t.body}</p> : null}
              </div>
              <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="self-start rounded p-1 text-muted hover:text-ink">
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
