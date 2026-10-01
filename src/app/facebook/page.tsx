"use client";

import { AppShell } from "@/components/layout/app-shell";
import { PlatformAnalytics } from "@/components/platform/platform-analytics";

export default function FacebookPage() {
  return (
    <AppShell
      title="Facebook Analytics"
      subtitle="Compare connected Facebook pages"
    >
      <PlatformAnalytics
        platform="FACEBOOK"
        title="Facebook"
        subtitle="Followers, reach, engagement, and growth across pages"
        extraMetrics="facebook"
      />
    </AppShell>
  );
}
