"use client";

import Link from "next/link";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import clsx from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={clsx("skeleton", className)} />;
}

export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="crazy-card rounded-xl border border-white/50 p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-8 w-32" />
          <Skeleton className="mt-3 h-3 w-20" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div role="status" aria-label="Loading chart">
      <Skeleton className="h-64 w-full" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading table" className="space-y-2">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <CardGridSkeleton count={8} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="crazy-card rounded-xl p-5 lg:col-span-3">
          <ChartSkeleton />
        </div>
        <div className="crazy-card rounded-xl p-5 lg:col-span-2">
          <TableSkeleton rows={3} />
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-sand-50/60 px-6 py-10 text-center">
      <Inbox size={28} aria-hidden="true" className="text-muted" />
      <p className="font-display text-lg text-navy-900">{title}</p>
      {body ? <p className="max-w-md text-sm text-muted">{body}</p> : null}
      {action ? (
        <Link href={action.href} className="rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-on-accent hover:bg-teal-500">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-down/40 bg-down/5 px-4 py-3 text-sm text-down">
      <AlertTriangle size={18} aria-hidden="true" className="shrink-0" />
      <p className="min-w-0 flex-1">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-md border border-down/40 px-3 py-1.5 font-medium hover:bg-down/10">
          <RefreshCw size={14} aria-hidden="true" /> Retry
        </button>
      ) : null}
    </div>
  );
}
