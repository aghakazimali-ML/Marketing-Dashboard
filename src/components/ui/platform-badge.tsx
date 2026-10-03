import clsx from "clsx";

const META: Record<string, { label: string; dot: string }> = {
  LINKEDIN: { label: "LinkedIn", dot: "bg-platform-linkedin" },
  FACEBOOK: { label: "Facebook", dot: "bg-platform-facebook" },
  INSTAGRAM: { label: "Instagram", dot: "bg-platform-instagram" },
  YOUTUBE: { label: "YouTube", dot: "bg-platform-youtube" },
  WEBSITE: { label: "Website", dot: "bg-platform-website" },
};

export function platformLabel(platform: string) {
  return META[platform]?.label ?? platform;
}

/** Colour dot + text label (the label carries the meaning, colour is decoration). */
export function PlatformBadge({ platform, className }: { platform: string; className?: string }) {
  const m = META[platform];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded border border-line bg-surface px-2 py-0.5 text-[11px] font-semibold text-navy-900", className)}>
      <span aria-hidden="true" className={clsx("size-2 rounded-full", m?.dot ?? "bg-muted")} />
      {m?.label ?? platform}
    </span>
  );
}
