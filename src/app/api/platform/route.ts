import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/authorization";
import { Platform } from "@/generated/prisma/client";
import { resolveRequestRange } from "@/lib/metrics/request";
import { previousRange } from "@/lib/metrics/periods";
import { getChannelMetricsForRange, getPostsForRange, getWebsiteMetrics } from "@/lib/metrics/queries";

export async function GET(req: NextRequest) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;

  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const { range, plan, clamped } = await resolveRequestRange(sp);
  const prev = previousRange(range);
  const compare = plan.features.periodComparison;
  const platform = (sp.platform || "FACEBOOK").toUpperCase() as Platform;
  if (!Object.values(Platform).includes(platform)) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  if (platform === Platform.WEBSITE) {
    const [current, previous] = await Promise.all([getWebsiteMetrics(range), compare ? getWebsiteMetrics(prev) : Promise.resolve(null)]);
    return NextResponse.json({ website: { current, previous }, clamped, comparisonLocked: !compare });
  }

  const [rows, previousRows, posts] = await Promise.all([
    getChannelMetricsForRange(platform, range),
    compare ? getChannelMetricsForRange(platform, prev) : Promise.resolve(null),
    plan.features.posts ? getPostsForRange(range, platform) : Promise.resolve([]),
  ]);
  return NextResponse.json({ rows, previousRows, posts, clamped, comparisonLocked: !compare, postsLocked: !plan.features.posts });
}
