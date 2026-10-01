import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/authorization";
import { Platform } from "@/generated/prisma/client";
import { parseRangeParams } from "@/lib/metrics/params";
import {
  getChannelMetricsForRange,
  getPostsForRange,
  getWebsiteMetrics,
  withDeltas,
} from "@/lib/metrics/queries";

export async function GET(req: NextRequest) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;

  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const range = parseRangeParams(sp);
  const platform = (sp.platform || "FACEBOOK").toUpperCase() as Platform;

  if (platform === Platform.WEBSITE) {
    const website = await getWebsiteMetrics(range);
    return NextResponse.json({ website });
  }

  const { current, previous } = await getChannelMetricsForRange(platform, range);
  const rows = withDeltas(current, previous);
  const posts = await getPostsForRange(range, platform);

  return NextResponse.json({ rows, posts });
}
