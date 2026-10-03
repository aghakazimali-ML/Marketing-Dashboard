import { logger } from "@/lib/logger";

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.INVITE_FROM_EMAIL);
}

export type EmailResult = { sent: boolean; reason?: "not_configured" | "unreachable" | "rejected"; status?: number };

/** Send through Resend. Never throws; callers decide how to surface failures. */
export async function sendEmail(msg: {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVITE_FROM_EMAIL;
  if (!apiKey || !from) return { sent: false, reason: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, ...msg }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      logger.warn("email rejected", { status: res.status });
      return { sent: false, reason: "rejected", status: res.status };
    }
    return { sent: true };
  } catch {
    return { sent: false, reason: "unreachable" };
  }
}

export function layout(title: string, bodyHtml: string, cta?: { label: string; url: string }) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#17313b"><h1 style="font-size:22px">${escapeHtml(title)}</h1>${bodyHtml}${
    cta
      ? `<p><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#0d9488;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none">${escapeHtml(cta.label)}</a></p>`
      : ""
  }</div>`;
}
