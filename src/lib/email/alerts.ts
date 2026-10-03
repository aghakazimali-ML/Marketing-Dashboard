import { prisma } from "@/lib/db";
import { DASHBOARD_NAME } from "@/lib/brand";
import { escapeHtml, layout, sendEmail } from "@/lib/email/send";

export async function adminEmails(): Promise<string[]> {
  const [owner, admins] = await Promise.all([
    prisma.dashboardOwner.findFirst({ select: { email: true } }),
    prisma.teamMember.findMany({ where: { role: "ADMIN", isActive: true }, select: { email: true } }),
  ]);
  return [...new Set([owner?.email, ...admins.map((a) => a.email)].filter((e): e is string => Boolean(e)))];
}

function baseUrl() {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function sendReconnectAlert(channelName: string, platform: string) {
  const to = await adminEmails();
  if (!to.length) return;
  const url = `${baseUrl()}/sync`;
  await sendEmail({
    to,
    subject: `${DASHBOARD_NAME}: reconnect ${channelName} (${platform})`,
    text: `The connection for ${channelName} (${platform}) has expired or was revoked, so new data is not being fetched. Reconnect it here: ${url}`,
    html: layout(
      "Reconnect needed",
      `<p>The connection for <strong>${escapeHtml(channelName)}</strong> (${escapeHtml(platform)}) has expired or was revoked, so new data is not being fetched.</p>`,
      { label: "Reconnect now", url }
    ),
  });
}

export async function sendExpiryWarning(channelName: string, platform: string, expiresAt: Date) {
  const to = await adminEmails();
  if (!to.length) return;
  const url = `${baseUrl()}/sync`;
  const when = expiresAt.toISOString().slice(0, 10);
  await sendEmail({
    to,
    subject: `${DASHBOARD_NAME}: ${channelName} access expires on ${when}`,
    text: `The access token for ${channelName} (${platform}) expires on ${when}. Reconnect before then to avoid a gap in data: ${url}`,
    html: layout(
      "Access expires soon",
      `<p>The access token for <strong>${escapeHtml(channelName)}</strong> (${escapeHtml(platform)}) expires on <strong>${escapeHtml(when)}</strong>. Reconnect before then to avoid a gap in data.</p>`,
      { label: "Review connections", url }
    ),
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  return sendEmail({
    to: [to],
    subject: `${DASHBOARD_NAME}: reset your password`,
    text: `Use this link to reset your password (valid for 30 minutes, single use): ${resetUrl}\nIf you did not request this, ignore this email.`,
    html: layout(
      "Reset your password",
      `<p>This link is valid for 30 minutes and can be used once. If you did not request it, you can ignore this email.</p>`,
      { label: "Choose a new password", url: resetUrl }
    ),
  });
}
