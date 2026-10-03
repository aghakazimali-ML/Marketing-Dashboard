import { logger } from "@/lib/logger";

/** Upstream said our credentials are invalid/expired: the channel needs reconnecting. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/** Upstream API failure. `summary` is client-safe; `detail` stays server-side/admin only. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public summary: string,
    public detail: string
  ) {
    super(summary);
    this.name = "ApiError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function summarizeStatus(status: number, label: string): string {
  if (status === 429) return `${label}: rate limited, will retry on the next fetch`;
  if (status >= 500) return `${label}: service temporarily unavailable (${status})`;
  if (status === 400) return `${label}: request rejected (400), check the account ID and permissions`;
  if (status === 404) return `${label}: account or resource not found (404)`;
  return `${label}: request failed (${status})`;
}

type Options = {
  label: string;
  retries?: number;
  /** Treat these statuses as auth failures in addition to 401. */
  authStatuses?: number[];
  /** Detect auth failures reported with a 400 (Meta) in the response body. */
  isAuthBody?: (body: string) => boolean;
};

/**
 * fetch with retry/backoff on 429 and 5xx. Throws AuthError on expired credentials and
 * ApiError otherwise; the full upstream body is logged server-side only.
 */
export async function apiFetch(url: string, init: RequestInit, opts: Options): Promise<Response> {
  const retries = opts.retries ?? 3;
  let attempt = 0;
  for (;;) {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(30_000) });
    } catch (e) {
      if (attempt < retries) {
        await sleep(backoff(attempt++));
        continue;
      }
      throw new ApiError(0, `${opts.label}: network error`, e instanceof Error ? e.message : String(e));
    }
    if (res.ok) return res;

    const body = await res.text().catch(() => "");
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < retries) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : backoff(attempt));
      attempt++;
      continue;
    }
    logger.warn("upstream api error", { label: opts.label, status: res.status, body: body.slice(0, 1500) });
    const authStatus = res.status === 401 || (opts.authStatuses ?? []).includes(res.status);
    if (authStatus || (opts.isAuthBody && opts.isAuthBody(body))) {
      throw new AuthError(`${opts.label}: authorization expired or revoked`);
    }
    throw new ApiError(res.status, summarizeStatus(res.status, opts.label), body.slice(0, 1500));
  }
}

function backoff(attempt: number) {
  return Math.min(1000 * 2 ** attempt, 8000) + Math.floor(Math.random() * 250);
}

export async function apiJson<T>(url: string, init: RequestInit, opts: Options): Promise<T> {
  const res = await apiFetch(url, init, opts);
  return (await res.json()) as T;
}
