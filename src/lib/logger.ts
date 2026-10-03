type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEY = /token|secret|password|authorization|api[-_]?key|cookie|private[-_]?key/i;

function threshold(): number {
  const l = (process.env.LOG_LEVEL ?? "info") as Level;
  return ORDER[l] ?? ORDER.info;
}

/** Remove anything that looks like a credential before it reaches the logs. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (typeof value === "string") {
    return value
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
      .replace(/([?&](?:access_token|key|client_secret|code|refresh_token)=)[^&\s"]+/gi, "$1[redacted]")
      .slice(0, 2000);
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1),
      ])
    );
  }
  return value;
}

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  if (ORDER[level] < threshold()) return;
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    msg,
    ...(redact(fields) as object),
  });
  (level === "error" || level === "warn" ? console.error : console.log)(line);
}

export const logger = {
  debug: (msg: string, f?: Record<string, unknown>) => log("debug", msg, f),
  info: (msg: string, f?: Record<string, unknown>) => log("info", msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => log("warn", msg, f),
  error: (msg: string, f?: Record<string, unknown>) => log("error", msg, f),
};

export function errorFields(e: unknown) {
  return e instanceof Error ? { error: e.message, name: e.name } : { error: String(e) };
}
