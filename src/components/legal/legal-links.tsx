import Link from "next/link";

export const LEGAL_LINKS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refund-policy", label: "Refund Policy" },
];

/** Compact footer links used on sign-in and billing pages. */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={`flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted ${className}`}>
      {LEGAL_LINKS.map((l) => (
        <Link key={l.href} href={l.href} className="hover:text-teal-700 hover:underline">{l.label}</Link>
      ))}
    </nav>
  );
}
