/** Browser-side fetch helper: redirects to sign-in on 401 and turns failures into readable errors. */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

let redirecting = false;

export function redirectToLogin(reason: "expired" | "signed_out" = "expired") {
  if (typeof window === "undefined" || redirecting) return;
  redirecting = true;
  const here = window.location.pathname + window.location.search;
  const params = new URLSearchParams({ next: here, reason });
  // Full navigation on purpose: it discards all in-memory client state of the previous session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `/login?${params.toString()}`;
}

export async function apiRequest<T>(
  input: string,
  init?: RequestInit & { redirectOn401?: boolean }
): Promise<T> {
  const { redirectOn401 = true, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(input, rest);
  } catch {
    throw new ApiClientError("Could not reach the server. Check your connection and try again.", 0);
  }
  if (res.status === 401 && redirectOn401) {
    redirectToLogin("expired");
    throw new ApiClientError("Your session expired. Please sign in again.", 401);
  }
  const text = await res.text();
  let json: unknown = null;
  if (text.trim()) {
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON body */
    }
  }
  if (!res.ok) {
    const message =
      (json && typeof json === "object" && "error" in json && typeof (json as { error: unknown }).error === "string"
        ? (json as { error: string }).error
        : null) ?? friendlyStatus(res.status);
    throw new ApiClientError(message, res.status);
  }
  return json as T;
}

function friendlyStatus(status: number) {
  if (status === 403) return "You do not have permission to do that.";
  if (status === 404) return "That could not be found.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status >= 500) return "Something went wrong on our side. Please try again.";
  return `Request failed (${status}).`;
}
