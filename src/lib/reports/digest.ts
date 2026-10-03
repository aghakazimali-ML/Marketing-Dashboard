import { prisma } from "@/lib/db";
import { adminEmails } from "@/lib/email/alerts";
import { escapeHtml, layout, sendEmail } from "@/lib/email/send";
import { resolveDateRange } from "@/lib/metrics/periods";
import { buildReport } from "@/lib/reports/build";
import { getWorkspace } from "@/lib/billing/workspace";
import { getBrandName } from "@/lib/billing/brand";
import { formatMetric } from "@/lib/metrics/format";

const DAY = 86_400_000;

/** Is a digest due? Weekly after ~6.5 days, monthly after ~27 days since the last one. */
export function digestDue(frequency: string, lastReportAt: Date | null, now = new Date()): boolean {
  if (frequency !== "WEEKLY" && frequency !== "MONTHLY") return false;
  if (!lastReportAt) return true;
  const elapsed = now.getTime() - lastReportAt.getTime();
  return elapsed >= (frequency === "WEEKLY" ? 6.5 : 27) * DAY;
}

export async function sendDueDigest(now = new Date()): Promise<{ sent: boolean; reason?: string }> {
  const ws = await getWorkspace();
  if (!ws.plan.features.scheduledReports) return { sent: false, reason: "not in plan" };
  const row = await prisma.workspace.findUnique({ where: { id: 1 } });
  const frequency = row?.reportFrequency ?? "NONE";
  if (!digestDue(frequency, row?.lastReportAt ?? null, now)) return { sent: false, reason: "not due" };

  const range = resolveDateRange(frequency === "WEEKLY" ? "last_7" : "last_month", undefined, undefined, now);
  const report = await buildReport(range, { includePosts: ws.plan.features.posts });
  const brand = await getBrandName();
  const to = [...new Set([...(await adminEmails()), ...(row?.reportRecipients ?? "").split(",").filter(Boolean)])];
  if (!to.length) return { sent: false, reason: "no recipients" };

  const k = report.kpi;
  const rows: [string, string][] = [
    ["Followers", formatMetric(k.followers)],
    ["Net new followers", formatMetric(k.newFollowers, "signed")],
    ["Impressions", formatMetric(k.impressions, "number", true)],
    ["Engagement", formatMetric(k.engagement, "number", true)],
    ["Website sessions", formatMetric(k.websiteSessions, "number", true)],
  ];
  const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const result = await sendEmail({
    to,
    subject: `${brand}: ${frequency === "WEEKLY" ? "weekly" : "monthly"} performance report (${range.label})`,
    text: `${report.executiveSummary}\n\n${rows.map(([a, b]) => `${a}: ${b}`).join("\n")}\n\nOpen the dashboard: ${baseUrl}`,
    html: layout(
      `${brand} — ${range.label}`,
      `<p>${escapeHtml(report.executiveSummary)}</p><table style="border-collapse:collapse;width:100%">${rows
        .map(([a, b]) => `<tr><td style="padding:6px 0;border-bottom:1px solid #dceee6">${escapeHtml(a)}</td><td style="padding:6px 0;border-bottom:1px solid #dceee6;text-align:right"><strong>${escapeHtml(b)}</strong></td></tr>`)
        .join("")}</table>`,
      { label: "Open dashboard", url: baseUrl }
    ),
  });
  if (!result.sent) return { sent: false, reason: result.reason };
  await prisma.workspace.upsert({ where: { id: 1 }, create: { id: 1, lastReportAt: now }, update: { lastReportAt: now } });
  return { sent: true };
}
