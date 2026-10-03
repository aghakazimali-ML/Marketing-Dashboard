import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";

type Step = { label: string; done: boolean; href?: string; hint: string };

/** Overview checklist shown until at least one channel is connected and data has been fetched. */
export function FirstRunChecklist({ hasChannels, hasData, isAdmin }: { hasChannels: boolean; hasData: boolean; isAdmin: boolean }) {
  const steps: Step[] = [
    { label: "Connect your first channel", done: hasChannels, href: "/sync", hint: "Add a LinkedIn page, Facebook page, Instagram account, YouTube channel or GA4 property on Pages & Fetch." },
    { label: "Fetch your data", done: hasData, href: "/sync", hint: "Click “Fetch All Data”. The first fetch backfills about 90 days where the platform allows it." },
    { label: "Invite your team", done: false, href: "/team", hint: "Add analysts so they can view dashboards and reports (optional)." },
    { label: "Set up a daily fetch", done: false, href: "/sync", hint: "Call the scheduled-fetch endpoint once a day so data refreshes without anyone clicking." },
  ];
  return (
    <SectionCard title="Get started" subtitle={isAdmin ? "Four quick steps to a working dashboard" : "An administrator needs to connect channels before data appears here"}>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.label} className="flex gap-3">
            {s.done ? (
              <CheckCircle2 size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-up" />
            ) : (
              <Circle size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
            )}
            <div>
              <p className="text-sm font-semibold text-navy-900">
                {i + 1}. {s.href && isAdmin && !s.done ? <Link href={s.href} className="text-teal-600 underline-offset-2 hover:underline">{s.label}</Link> : s.label}
                <span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
              </p>
              <p className="text-xs text-muted">{s.hint}</p>
            </div>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}
