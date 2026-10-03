import { formatNumber } from "@/lib/metrics/periods";

export function SectionCard({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="crazy-card rounded-xl border border-white/50 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-navy-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function InsightPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-line bg-sand-50/70 px-4 py-3 backdrop-blur-sm">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-navy-900">{value}</p>
    </div>
  );
}

export function LeaderCard({
  rank,
  title,
  winner,
  metric,
  detail,
}: {
  rank?: string;
  title: string;
  winner: string;
  metric: string;
  detail?: string;
}) {
  return (
    <div className="leader-card relative overflow-hidden rounded-xl border border-lime/30 p-5 shadow-[0_12px_40px_rgba(30,126,52,0.35)]">
      <div aria-hidden="true" className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-lime/30 blur-sm" />
      <div aria-hidden="true" className="absolute -bottom-8 left-8 h-24 w-24 rounded-full bg-electric/25 blur-md" />
      <p className="relative text-[11px] font-semibold tracking-[0.12em] text-lime uppercase">
        {rank ?? "Leader"} · {title}
      </p>
      <p className="font-display relative mt-2 text-xl">{winner}</p>
      <p className="relative mt-1 text-2xl font-semibold tabular-nums text-electric">
        {metric}
      </p>
      {detail ? <p className="relative mt-2 text-xs text-white/60">{detail}</p> : null}
    </div>
  );
}

export function formatCompact(n: number) {
  return formatNumber(n, true);
}
