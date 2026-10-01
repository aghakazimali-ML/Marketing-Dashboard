import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/authorization";
import { Platform } from "@/generated/prisma/client";
import { parseRangeParams } from "@/lib/metrics/params";
import { getPostsForRange } from "@/lib/metrics/queries";

export async function GET(req: NextRequest) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;

  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const range = parseRangeParams(sp);
  const platform = sp.platform
    ? (sp.platform.toUpperCase() as Platform)
    : undefined;
  const sort = sp.sort || "engagement";

  let posts = await getPostsForRange(range, platform);

  const sorters: Record<string, (a: (typeof posts)[0], b: (typeof posts)[0]) => number> = {
    views: (a, b) => b.views - a.views,
    engagement: (a, b) => b.engagement - a.engagement,
    shares: (a, b) => b.shares - a.shares,
    clicks: (a, b) => b.clicks - a.clicks,
    ctr: (a, b) => b.ctr - a.ctr,
    impressions: (a, b) => b.impressions - a.impressions,
  };

  posts = [...posts].sort(sorters[sort] ?? sorters.engagement);

  return NextResponse.json({ posts });
}
