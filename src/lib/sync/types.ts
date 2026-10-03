import type { Channel } from "@/generated/prisma/client";

export type ChannelSyncContext = {
  channel: Channel;
  /** Resolved (and refreshed) access token, or null if none is configured. */
  token: string | null;
  /** Today as a UTC-midnight key. */
  today: Date;
  /** First day to (re)fetch, inclusive. */
  from: Date;
};

export type ChannelSyncResult = {
  records: number;
  /** Non-fatal notes, e.g. a metric the API rejected. */
  notes: string[];
};
