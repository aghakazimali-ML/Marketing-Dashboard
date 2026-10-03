import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { clientIp } from "@/lib/security/client-ip";

export type AuditAction =
  | "login.success" | "login.failure" | "login.locked" | "logout"
  | "owner.created" | "password.changed" | "password.reset_requested" | "password.reset_completed"
  | "invite.created" | "invite.accepted" | "invite.revoked"
  | "member.role_changed" | "member.disabled" | "member.enabled"
  | "channel.created" | "channel.updated" | "channel.deleted" | "channel.token_changed" | "channel.oauth_connected"
  | "ai.settings_changed" | "sync.manual" | "sync.cron"
  | "billing.checkout_started" | "billing.portal_opened" | "billing.plan_changed"
  | "billing.payment_completed" | "billing.payment_failed" | "billing.payment_rejected";

type Actor = { email?: string | null; role?: string | null };

/** Append an audit record. Never throws: auditing must not break the action itself. */
export async function audit(
  action: AuditAction,
  opts: { req?: NextRequest; actor?: Actor | null; target?: string; success?: boolean; meta?: Record<string, unknown> } = {}
) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        actorEmail: opts.actor?.email ?? null,
        actorRole: opts.actor?.role ?? null,
        target: opts.target?.slice(0, 300) ?? null,
        success: opts.success ?? true,
        ip: opts.req ? clientIp(opts.req) : null,
        meta: opts.meta ? JSON.stringify(opts.meta).slice(0, 2000) : null,
      },
    });
  } catch (e) {
    logger.error("audit write failed", { action, error: e instanceof Error ? e.message : String(e) });
  }
}
