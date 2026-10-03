import type { Platform } from "@/generated/prisma/client";
import { ratioPct, round, sumNullable, type Metric } from "@/lib/metrics/aggregate";

type Row = { platform: Platform } & Record<string, unknown>;

export type Total = { value: Metric; /** Platforms that actually contributed a value. */ platforms: Platform[] };

/** Sum a metric across channels, skipping nulls and reporting which platforms were included. */
export function totalFor<T extends Row>(rows: T[], key: keyof T & string): Total {
  const included = new Set<Platform>();
  const values: Metric[] = [];
  for (const r of rows) {
    const v = r[key] as Metric | undefined;
    if (v !== null && v !== undefined) {
      values.push(v);
      included.add(r.platform);
    }
  }
  return { value: sumNullable(values), platforms: [...included] };
}

/** Percent change vs the previous period; null when either side is missing or previous is 0. */
export function deltaPct(current: Metric, previous: Metric): Metric {
  if (current === null || previous === null || previous === 0) return null;
  return round(((current - previous) / Math.abs(previous)) * 100, 1);
}

export { ratioPct };

/** Average of `key` weighted by `weightKey` (e.g. view duration weighted by views). */
export function weightedAvg<T extends Row>(rows: T[], key: keyof T & string, weightKey: keyof T & string): Metric {
  let total = 0;
  let weight = 0;
  for (const r of rows) {
    const v = r[key] as Metric | undefined;
    const w = r[weightKey] as Metric | undefined;
    if (v === null || v === undefined || w === null || w === undefined || w <= 0) continue;
    total += v * w;
    weight += w;
  }
  return weight > 0 ? round(total / weight, 1) : null;
}
