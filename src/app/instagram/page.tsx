"use client";

import { AppShell } from "@/components/layout/app-shell";
import { PlatformAnalytics } from "@/components/platform/platform-analytics";

export default function InstagramPage() {
  return (
    <AppShell
      title="Instagram Analytics"
      subtitle="Performance across connected Instagram accounts"
    >
      <PlatformAnalytics
        platform="INSTAGRAM"
        title="Instagram"
        subtitle="Reach, reels, saves, profile visits, and engagement"
        extraMetrics="instagram"
      />
    </AppShell>
  );
}
