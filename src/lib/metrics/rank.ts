/** Sort descending by a nullable value; rows with no value go last and never "win". */
export function rankBy<T>(
  rows: T[],
  getValue: (row: T) => number | null,
  direction: "desc" | "asc" = "desc"
): T[] {
  const withValue = rows.filter((r) => getValue(r) !== null);
  const without = rows.filter((r) => getValue(r) === null);
  withValue.sort((a, b) =>
    direction === "desc"
      ? (getValue(b) as number) - (getValue(a) as number)
      : (getValue(a) as number) - (getValue(b) as number)
  );
  return [...withValue, ...without];
}

/** The leader for a metric, or undefined when nobody has a value. */
export function leaderBy<T>(rows: T[], getValue: (row: T) => number | null): T | undefined {
  const top = rankBy(rows, getValue)[0];
  return top && getValue(top) !== null ? top : undefined;
}

