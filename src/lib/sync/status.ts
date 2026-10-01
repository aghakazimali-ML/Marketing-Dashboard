import { Platform } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export type ConnectionInfo = {
  platform: Platform;
  label: string;
  connected: boolean;
  mode: "live" | "unconfigured";
  hint: string;
  envKeys: string[];
  pageCount: number;
  pagesWithCredentials: number;
};

export async function getConnectionStatus(): Promise<ConnectionInfo[]> {
  const channels = await prisma.channel.findMany({
    where: { isActive: true },
    select: {
      platform: true,
      accessToken: true,
      apiKey: true,
      externalId: true,
    },
  });

  function forPlatform(platform: Platform) {
    const pages = channels.filter((c) => c.platform === platform);
    return {
      pageCount: pages.length,
      pagesWithCredentials: pages.filter(
        (c) => Boolean(c.accessToken || c.apiKey) && Boolean(c.externalId)
      ).length,
      anyToken: pages.some((c) => Boolean(c.accessToken || c.apiKey)),
      hasExternalId: pages.some((c) => Boolean(c.externalId)),
    };
  }

  const li = forPlatform(Platform.LINKEDIN);
  const fb = forPlatform(Platform.FACEBOOK);
  const ig = forPlatform(Platform.INSTAGRAM);
  const yt = forPlatform(Platform.YOUTUBE);
  const web = forPlatform(Platform.WEBSITE);

  const linkedin =
    (Boolean(process.env.LINKEDIN_ACCESS_TOKEN?.trim()) && li.hasExternalId) || li.pagesWithCredentials > 0;
  const meta =
    (Boolean(process.env.META_ACCESS_TOKEN?.trim()) && (fb.hasExternalId || ig.hasExternalId)) || fb.pagesWithCredentials > 0 || ig.pagesWithCredentials > 0;
  const youtube =
    Boolean(
      process.env.YOUTUBE_API_KEY?.trim() || process.env.YOUTUBE_ACCESS_TOKEN?.trim()
    ) && yt.hasExternalId || yt.pagesWithCredentials > 0;
  const ga4 =
    (Boolean(process.env.GA4_PROPERTY_ID?.trim()) &&
      Boolean(
        process.env.GA4_ACCESS_TOKEN?.trim() ||
          process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
      )) ||
    web.pagesWithCredentials > 0 ||
    (Boolean(process.env.GA4_ACCESS_TOKEN?.trim() || process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) && web.hasExternalId);

  function entry(
    platform: Platform,
    label: string,
    connected: boolean,
    envKeys: string[],
    hint: string,
    stats: { pageCount: number; pagesWithCredentials: number }
  ): ConnectionInfo {
    return {
      platform,
      label,
      connected,
      mode: connected ? "live" : "unconfigured",
      hint: connected
        ? hint
        : `Configure a page/property ID and credentials (${envKeys.join(", ")}) to fetch live data. Unconfigured sources will not write data.`,
      envKeys,
      pageCount: stats.pageCount,
      pagesWithCredentials: stats.pagesWithCredentials,
    };
  }

  return [
    entry(
      Platform.LINKEDIN,
      "LinkedIn",
      linkedin,
      ["LINKEDIN_ACCESS_TOKEN"],
      `${li.pageCount} page(s) registered — fetch uses each page’s token or the global LinkedIn token.`,
      li
    ),
    entry(
      Platform.FACEBOOK,
      "Facebook",
      meta,
      ["META_ACCESS_TOKEN"],
      `${fb.pageCount} page(s) registered — Meta Graph API.`,
      fb
    ),
    entry(
      Platform.INSTAGRAM,
      "Instagram",
      meta,
      ["META_ACCESS_TOKEN"],
      `${ig.pageCount} account(s) registered — Instagram Graph API.`,
      ig
    ),
    entry(
      Platform.YOUTUBE,
      "YouTube",
      youtube,
      ["YOUTUBE_API_KEY"],
      `${yt.pageCount} channel(s) registered — YouTube Data API.`,
      yt
    ),
    entry(
      Platform.WEBSITE,
      "Website (GA4)",
      ga4,
      ["GA4_PROPERTY_ID", "GA4_ACCESS_TOKEN"],
      `${web.pageCount} property(ies) registered — GA4 Data API.`,
      web
    ),
  ];
}
