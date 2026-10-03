import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/authorization";
import { getWorkspace, upgradeResponse } from "@/lib/billing/workspace";
import { getBrandName } from "@/lib/billing/brand";

const schema = z.object({
  brandName: z.string().trim().max(60).optional().nullable(),
  reportFrequency: z.enum(["NONE", "WEEKLY", "MONTHLY"]).optional(),
  reportRecipients: z.array(z.email().max(254)).max(20).optional(),
});

export async function GET(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;
  const [row, brand] = await Promise.all([prisma.workspace.findUnique({ where: { id: 1 } }), getBrandName()]);
  return NextResponse.json({
    brandName: row?.brandName ?? null,
    effectiveBrandName: brand,
    reportFrequency: row?.reportFrequency ?? "NONE",
    reportRecipients: (row?.reportRecipients ?? "").split(",").filter(Boolean),
    lastReportAt: row?.lastReportAt ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Check the values and try again." }, { status: 400 });

  const ws = await getWorkspace();
  const { brandName, reportFrequency, reportRecipients } = body.data;
  if (brandName !== undefined && !ws.plan.features.whiteLabel) return upgradeResponse("whiteLabel");
  if ((reportFrequency && reportFrequency !== "NONE") || reportRecipients) {
    if (!ws.plan.features.scheduledReports) return upgradeResponse("scheduledReports");
  }

  const data = {
    ...(brandName !== undefined ? { brandName: brandName?.trim() || null } : {}),
    ...(reportFrequency ? { reportFrequency } : {}),
    ...(reportRecipients ? { reportRecipients: reportRecipients.map((e) => e.toLowerCase()).join(",") || null } : {}),
  };
  await prisma.workspace.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  return NextResponse.json({ ok: true });
}
