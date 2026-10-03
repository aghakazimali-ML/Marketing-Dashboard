/** Only same-site relative paths are allowed as post-login destinations (SEC-5). */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  return /^\/(?![/\\])/.test(next) && !/[\r\n\t]/.test(next) ? next : fallback;
}
