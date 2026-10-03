import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/authorization";
import { Platform } from "@/generated/prisma/client";
import { resolveRequestRange } from "@/lib/metrics/request";
import { gateFeature } from "@/lib/billing/workspace";
import { getPostsForRange, rankBy, type PostRow } from "@/lib/metrics/queries";

const SORTERS: Record<string, (p: PostRow) => number | null> = {
  views: (p) => p.views,
  engagement: (p) => p.engagement,
  shares: (p) => p.shares,
  clicks: (p) => p.clicks,
  ctr: (p) => p.ctr,
  impressions: (p) => p.impressions,
};

export async function GET(req: NextRequest) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;

  const gate = await gateFeature("posts");
  if (!gate.ok) return gate.response;

  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const { range } = await resolveRequestRange(sp);
  const platform = sp.platform ? (sp.platform.toUpperCase() as Platform) : undefined;
  if (platform && !Object.values(Platform).includes(platform)) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }
  const posts = rankBy(await getPostsForRange(range, platform), SORTERS[sp.sort ?? ""] ?? SORTERS.engagement);
  return NextResponse.json({ posts });
}
