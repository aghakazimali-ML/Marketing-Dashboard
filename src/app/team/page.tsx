"use client";

import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/components/providers/auth-provider";
import { SectionCard } from "@/components/ui/section-card";
import { TeamManager } from "@/components/team/team-manager";

export default function TeamPage() {
  return (
    <AppShell title="Team & Access" subtitle="Manage company accounts and permissions">
      <TeamContent />
    </AppShell>
  );
}

function TeamContent() {
  const user = useAuth();

  if (user?.role === "ADMIN") return <TeamManager />;
  if (!user) return <p className="text-sm text-muted">Loading access…</p>;

  return (
    <SectionCard title="Administrator access required">
      <p className="text-sm text-muted">Only administrators can manage team accounts and access.</p>
    </SectionCard>
  );
}