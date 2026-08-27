"use client";

import { AppShell } from "@/components/layout/app-shell";
import { PlatformAnalytics } from "@/components/platform/platform-analytics";

export default function YouTubePage() {
  return (
    <AppShell
      title="YouTube Analytics"
      subtitle="NETS International channel performance"
    >
      <PlatformAnalytics
        platform="YOUTUBE"
        title="YouTube"
        subtitle="Subscribers, views, watch time, and top videos"
        extraMetrics="youtube"
      />
    </AppShell>
  );
}
