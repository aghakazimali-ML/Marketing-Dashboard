/** Metrics are stored per UTC calendar day; the key is that day at 00:00 UTC. */
export function utcDay(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

/** Calendar day of a *local* date (what the user picked), as a UTC-midnight key. */
export function localDayToUtc(input: Date): Date {
  return new Date(Date.UTC(input.getFullYear(), input.getMonth(), input.getDate()));
}

export function addDaysUtc(day: Date, n: number): Date {
  return new Date(day.getTime() + n * 86_400_000);
}

export function dayKey(day: Date): string {
  return day.toISOString().slice(0, 10);
}

/** Parse "YYYY-MM-DD" or "YYYYMMDD" into a UTC-midnight date. */
export function parseDayString(value: string): Date | null {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Inclusive list of UTC days from start to end. */
export function eachDayUtc(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  for (let d = start; d <= end; d = addDaysUtc(d, 1)) out.push(d);
  return out;
}
