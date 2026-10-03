export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Only enforce at runtime in production; `next build` must work without secrets.
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { assertEnv } = await import("@/lib/config");
    assertEnv();
  }
}
