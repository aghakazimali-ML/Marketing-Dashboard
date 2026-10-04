import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { getLegalInfo } from "@/lib/legal";
import { LegalLinks } from "@/components/legal/legal-links";

export function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  const info = getLegalInfo();
  return (
    <div className="app-stage min-h-screen px-4 py-10">
      <main id="main" className="crazy-card mx-auto w-full max-w-3xl rounded-2xl p-6 sm:p-10">
        <div className="flex items-center gap-3 text-teal-600">
          <BarChart3 size={28} strokeWidth={1.6} aria-hidden="true" />
          <span className="font-display text-lg text-navy-900">{info.product}</span>
        </div>
        <h1 className="mt-6 font-display text-3xl text-navy-900">{title}</h1>
        <p className="mt-1 text-xs text-muted">Effective {info.effective}</p>
        <p className="mt-4 text-sm leading-relaxed text-ink">{intro}</p>
        <div className="legal-body mt-6 space-y-6 text-sm leading-relaxed text-ink">{children}</div>
        <LegalLinks className="mt-10 border-t border-line pt-5" />
        <p className="mt-3 text-center text-xs text-muted">
          <Link href="/login" className="hover:underline">Back to sign in</Link>
        </p>
      </main>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-lg text-navy-900">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

export function Contact({ label = "Questions" }: { label?: string }) {
  const info = getLegalInfo();
  return (
    <p>
      {label}? Contact {info.company}
      {info.supportEmail ? <> at <a className="font-medium text-teal-700 hover:underline" href={`mailto:${info.supportEmail}`}>{info.supportEmail}</a></> : " through your account administrator"}
      {info.address ? <>. Address: {info.address}, {info.country}</> : null}.
    </p>
  );
}
