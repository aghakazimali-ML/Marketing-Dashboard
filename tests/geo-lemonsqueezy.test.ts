import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { clearCountryCache, detectCountry, isPublicIp, normalizeCountry, parseGeoResponse } from "@/lib/geo/country";
import { regionForCountry, resolveBillingContext } from "@/lib/billing/region";
import {
  createCheckout, lemonConfig, parseWebhook, planForVariant, signForTests, variantIdFor, verifyWebhook,
} from "@/lib/billing/lemonsqueezy";
import { applyLemonEvent } from "@/lib/billing/lemon-sync";
import { getWorkspace } from "@/lib/billing/workspace";
import { POST as lsWebhook } from "@/app/api/billing/lemonsqueezy/webhook/route";
import { POST as lsCheckout } from "@/app/api/billing/lemonsqueezy/checkout/route";
import { POST as lsPortal } from "@/app/api/billing/lemonsqueezy/portal/route";
import { POST as safepayCheckout } from "@/app/api/billing/safepay/checkout/route";
import { GET as entitlements } from "@/app/api/billing/entitlements/route";
import { createSessionToken, hashPassword, SESSION_COOKIE } from "@/lib/auth/session";
import { MemoryRateLimitStore, setRateLimitStore } from "@/lib/security/rate-limit";

const SECRET = "ls-signing-secret";

function setEnv() {
  Object.assign(process.env, {
    LEMONSQUEEZY_API_KEY: "ls_key", LEMONSQUEEZY_STORE_ID: "1234", LEMONSQUEEZY_WEBHOOK_SECRET: SECRET,
    LEMONSQUEEZY_VARIANT_STARTER_MONTHLY: "101", LEMONSQUEEZY_VARIANT_PRO_MONTHLY: "201", LEMONSQUEEZY_VARIANT_PRO_YEARLY: "202",
    LEMONSQUEEZY_VARIANT_EXCLUSIVE_MONTHLY: "301",
    SAFEPAY_API_KEY: "k", SAFEPAY_SECRET_KEY: "s", SAFEPAY_WEBHOOK_SECRET: "w",
    APP_BASE_URL: "https://dash.example.com", TRUST_PROXY: "true",
  });
  for (const k of ["LICENSE_PLAN", "GEOIP_FORCE_COUNTRY", "GEOIP_URL", "DEFAULT_BILLING_REGION", "LEMONSQUEEZY_TEST_MODE"]) delete process.env[k];
}

const req = (headers: Record<string, string> = {}) => ({ headers: { get: (n: string) => headers[n.toLowerCase()] ?? null } });

beforeEach(async () => {
  setEnv();
  clearCountryCache();
  setRateLimitStore(new MemoryRateLimitStore());
  await prisma.workspace.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.dashboardOwner.deleteMany();
});
afterEach(() => vi.unstubAllGlobals());

describe("country detection (IP geolocation, no user choice)", () => {
  it("normalises codes and recognises public IPs", () => {
    expect(normalizeCountry("pk")).toBe("PK");
    expect(normalizeCountry("XX")).toBeNull();
    expect(normalizeCountry("Pakistan")).toBeNull();
    expect(isPublicIp("8.8.8.8")).toBe(true);
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.5", "172.20.0.1", "::1", "direct", "unknown"]) expect(isPublicIp(ip)).toBe(false);
  });

  it("reads the common geo API response shapes", () => {
    expect(parseGeoResponse({ success: true, country_code: "PK" })).toBe("PK");
    expect(parseGeoResponse({ countryCode: "us" })).toBe("US");
    expect(parseGeoResponse({ success: false, message: "limit" })).toBeNull();
    expect(parseGeoResponse(null)).toBeNull();
  });

  it("honours a CDN header when TRUST_PROXY=true and ignores it otherwise", async () => {
    expect(await detectCountry(req({ "cf-ipcountry": "DE" }), { TRUST_PROXY: "true" } as unknown as NodeJS.ProcessEnv)).toEqual({ country: "DE", source: "header" });
    expect((await detectCountry(req({ "cf-ipcountry": "DE" }), {} as NodeJS.ProcessEnv)).country).toBeNull();
  });

  it("looks the client IP up through the geolocation API and caches the answer", async () => {
    const f = vi.fn<(url: string) => Promise<Response>>(async () => new Response(JSON.stringify({ success: true, country_code: "PK" }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const r = req({ "x-forwarded-for": "39.40.1.1" });
    expect(await detectCountry(r)).toEqual({ country: "PK", source: "api" });
    expect((await detectCountry(r)).country).toBe("PK");
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0][0])).toBe("https://ipwho.is/39.40.1.1");
  });

  it("does not call the API for private/local addresses, and survives API failures", async () => {
    const f = vi.fn(async () => { throw new Error("down"); });
    vi.stubGlobal("fetch", f);
    expect((await detectCountry(req({ "x-forwarded-for": "10.0.0.5" }))).country).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect((await detectCountry(req({ "x-forwarded-for": "8.8.4.4" }))).country).toBeNull();
  });

  it("supports a custom API URL template", async () => {
    process.env.GEOIP_URL = "https://geo.example/v1/{ip}?key={key}";
    process.env.GEOIP_API_KEY = "abc";
    const f = vi.fn<(url: string) => Promise<Response>>(async () => new Response(JSON.stringify({ countryCode: "GB" }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect((await detectCountry(req({ "x-forwarded-for": "81.2.69.142" }))).country).toBe("GB");
    expect(String(f.mock.calls[0][0])).toBe("https://geo.example/v1/81.2.69.142?key=abc");
  });
});

describe("billing region", () => {
  it("Pakistan -> PKR via Safepay; everyone else -> USD via Lemon Squeezy; unknown -> operator default", () => {
    expect(regionForCountry("PK")).toBe("PK");
    expect(regionForCountry("US")).toBe("INTL");
    expect(regionForCountry("AE")).toBe("INTL");
    expect(regionForCountry(null)).toBe("PK");
    expect(regionForCountry(null, { DEFAULT_BILLING_REGION: "INTL" } as unknown as NodeJS.ProcessEnv)).toBe("INTL");
  });

  it("is decided from the IP, and a client-supplied header/param cannot change it", async () => {
    expect(await resolveBillingContext(req({ "cf-ipcountry": "US" }))).toMatchObject({ region: "INTL", provider: "LEMONSQUEEZY", currency: "USD", locked: false });
    expect(await resolveBillingContext(req({ "cf-ipcountry": "PK" }))).toMatchObject({ region: "PK", provider: "SAFEPAY", currency: "PKR" });
    process.env.TRUST_PROXY = "false";
    // untrusted: the spoofable header is ignored (falls back to the default region)
    expect((await resolveBillingContext(req({ "cf-ipcountry": "US", "x-country": "US" }))).region).toBe("PK");
  });

  it("keeps a workspace on the provider it already pays through", async () => {
    await prisma.workspace.create({ data: { id: 1, plan: "PRO", billingProvider: "SAFEPAY", billingInterval: "month", currentPeriodEnd: new Date(Date.now() + 86_400_000) } });
    expect(await resolveBillingContext(req({ "cf-ipcountry": "US" }))).toMatchObject({ provider: "SAFEPAY", currency: "PKR", locked: true });
  });
});

describe("Lemon Squeezy client", () => {
  it("needs all three secrets and maps variants both ways", () => {
    expect(lemonConfig()?.storeId).toBe("1234");
    expect(variantIdFor("PRO", "month")).toBe("201");
    expect(variantIdFor("STARTER", "year")).toBeNull();
    expect(planForVariant(202)).toEqual({ plan: "PRO", interval: "year" });
    expect(planForVariant("999")).toBeNull();
    delete process.env.LEMONSQUEEZY_STORE_ID;
    expect(lemonConfig()).toBeNull();
  });

  it("creates a JSON:API checkout with store, variant, email, redirect and custom data", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ data: { attributes: { url: "https://shop.lemonsqueezy.com/checkout/custom/abc" } } }), { status: 201 }));
    vi.stubGlobal("fetch", f);
    const url = await createCheckout(lemonConfig()!, { variantId: "201", email: "a@x.com", redirectUrl: "https://dash/billing", custom: { workspace: "1" } });
    expect(url).toBe("https://shop.lemonsqueezy.com/checkout/custom/abc");
    const [u, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(u).toBe("https://api.lemonsqueezy.com/v1/checkouts");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ls_key");
    const body = JSON.parse(String(init.body));
    expect(body.data.type).toBe("checkouts");
    expect(body.data.relationships.store.data).toEqual({ type: "stores", id: "1234" });
    expect(body.data.relationships.variant.data).toEqual({ type: "variants", id: "201" });
    expect(body.data.attributes.checkout_data).toEqual({ email: "a@x.com", custom: { workspace: "1" } });
    expect(body.data.attributes.product_options.redirect_url).toBe("https://dash/billing");
  });

  it("verifies the X-Signature over the exact raw body", () => {
    const raw = '{"meta":{"event_name":"subscription_created"}}';
    const sig = signForTests(raw, SECRET);
    expect(verifyWebhook(raw, sig, SECRET)).toBe(true);
    expect(verifyWebhook(raw + " ", sig, SECRET)).toBe(false);
    expect(verifyWebhook(raw, sig, "other")).toBe(false);
    expect(verifyWebhook(raw, null, SECRET)).toBe(false);
  });
});

function event(name: string, attrs: Record<string, unknown> = {}, custom: Record<string, unknown> = { workspace: "1" }) {
  return {
    meta: { event_name: name, custom_data: custom },
    data: {
      type: "subscriptions", id: "sub_77",
      attributes: {
        customer_id: 555, variant_id: 201, status: "active", cancelled: false,
        renews_at: "2026-11-10T00:00:00.000Z", ends_at: null, updated_at: "2026-10-10T10:00:00.000Z",
        urls: { customer_portal: "https://shop.lemonsqueezy.com/billing?u=1" }, ...attrs,
      },
    },
  };
}

describe("subscription events", () => {
  it("activates the plan from subscription_created and stores the portal link", async () => {
    const r = await applyLemonEvent(parseWebhook(event("subscription_created"))!);
    expect(r).toMatchObject({ applied: true, plan: "PRO" });
    const ws = await getWorkspace();
    expect(ws).toMatchObject({ planId: "PRO", source: "lemonsqueezy", interval: "month", billingProvider: "LEMONSQUEEZY", portalUrl: "https://shop.lemonsqueezy.com/billing?u=1" });
    expect(ws.currentPeriodEnd?.toISOString().slice(0, 10)).toBe("2026-11-10");
  });

  it("ignores events that are not for this installation, unknown variants and stale events", async () => {
    expect(await applyLemonEvent(parseWebhook(event("subscription_created", {}, { workspace: "other" }))!)).toEqual({ applied: false, reason: "wrong_workspace" });
    expect(await applyLemonEvent(parseWebhook(event("subscription_created", { variant_id: 999 }))!)).toEqual({ applied: false, reason: "unknown_variant" });
    await applyLemonEvent(parseWebhook(event("subscription_updated", { variant_id: 202, updated_at: "2026-10-12T00:00:00.000Z" }))!);
    const stale = await applyLemonEvent(parseWebhook(event("subscription_updated", { variant_id: 101, updated_at: "2026-10-11T00:00:00.000Z" }, {}))!);
    expect(stale).toEqual({ applied: false, reason: "stale" });
    expect((await getWorkspace()).interval).toBe("year");
  });

  it("past_due keeps access; cancelled keeps access until ends_at; expired falls back to Free", async () => {
    await applyLemonEvent(parseWebhook(event("subscription_created"))!);
    await applyLemonEvent(parseWebhook(event("subscription_payment_failed", { status: "past_due", updated_at: "2026-10-11T00:00:00.000Z" }))!);
    expect((await getWorkspace()).planId).toBe("PRO");

    const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
    await applyLemonEvent(parseWebhook(event("subscription_cancelled", { status: "cancelled", cancelled: true, ends_at: future, updated_at: "2026-10-12T00:00:00.000Z" }))!);
    const cancelled = await getWorkspace();
    expect(cancelled).toMatchObject({ planId: "PRO", cancelAtPeriodEnd: true });

    await applyLemonEvent(parseWebhook(event("subscription_cancelled", { status: "cancelled", cancelled: true, ends_at: "2026-10-01T00:00:00.000Z", updated_at: "2026-10-13T00:00:00.000Z" }))!);
    expect((await getWorkspace()).planId).toBe("FREE");

    await applyLemonEvent(parseWebhook(event("subscription_updated", { status: "active", updated_at: "2026-10-14T00:00:00.000Z" }))!);
    expect((await getWorkspace()).planId).toBe("PRO");
    await applyLemonEvent(parseWebhook(event("subscription_expired", { status: "expired", updated_at: "2026-10-15T00:00:00.000Z" }))!);
    const expired = await getWorkspace();
    expect(expired.planId).toBe("FREE");
    expect(expired.currentPeriodEnd).toBeNull();
  });
});

describe("webhook route", () => {
  const send = (body: unknown, sig?: string | null) => {
    const raw = typeof body === "string" ? body : JSON.stringify(body);
    return lsWebhook(new NextRequest("http://localhost/api/billing/lemonsqueezy/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", ...(sig === null ? {} : { "x-signature": sig ?? signForTests(raw, SECRET) }) },
      body: raw,
    }));
  };
  it("rejects bad signatures and changes nothing", async () => {
    expect((await send(event("subscription_created"), "deadbeef")).status).toBe(400);
    expect((await send(event("subscription_created"), null)).status).toBe(400);
    expect(await prisma.workspace.count()).toBe(0);
  });
  it("applies a correctly signed event and is safe to replay", async () => {
    expect((await send(event("subscription_created"))).status).toBe(200);
    expect((await send(event("subscription_created"))).status).toBe(200);
    expect((await getWorkspace()).planId).toBe("PRO");
    expect(await prisma.auditLog.count({ where: { action: "billing.plan_changed" } })).toBe(1);
  });
  it("is unavailable when Lemon Squeezy is not configured", async () => {
    delete process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    expect((await send(event("subscription_created"), "x")).status).toBe(503);
  });
});

async function adminCookie() {
  await prisma.dashboardOwner.create({ data: { id: 1, name: "O", email: "own@x.com", passwordHash: await hashPassword("correct-horse-battery") } });
  return `${SESSION_COOKIE}=${await createSessionToken("own@x.com", "ADMIN", undefined, { sessionVersion: 0 })}`;
}
const post = (route: typeof lsCheckout, cookie: string, body: unknown, country: string) =>
  route(new NextRequest("http://localhost/x", { method: "POST", headers: { "content-type": "application/json", cookie, "cf-ipcountry": country }, body: JSON.stringify(body) }));

describe("checkout routes follow the detected region", () => {
  it("international visitors get a Lemon Squeezy checkout; Pakistan is refused there", async () => {
    const cookie = await adminCookie();
    const f = vi.fn(async () => new Response(JSON.stringify({ data: { attributes: { url: "https://shop.lemonsqueezy.com/checkout/custom/x" } } }), { status: 201 }));
    vi.stubGlobal("fetch", f);
    const ok = await post(lsCheckout, cookie, { plan: "PRO", interval: "month", variant: "999" }, "US");
    expect(ok.status).toBe(200);
    expect((await ok.json()).url).toContain("lemonsqueezy.com");
    const sent = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent.data.relationships.variant.data.id).toBe("201"); // variant comes from the server, not the client
    expect(sent.data.attributes.checkout_data.custom).toMatchObject({ workspace: "1", plan: "PRO" });
    expect((await post(lsCheckout, cookie, { plan: "PRO", interval: "month" }, "PK")).status).toBe(409);
  });
  it("Pakistani visitors are refused the international checkout, and international ones the Safepay one", async () => {
    const cookie = await adminCookie();
    expect((await post(safepayCheckout, cookie, { plan: "PRO", interval: "month" }, "US")).status).toBe(409);
  });
  it("needs configuration and a variant for the chosen plan", async () => {
    const cookie = await adminCookie();
    expect((await post(lsCheckout, cookie, { plan: "STARTER", interval: "year" }, "US")).status).toBe(503); // no yearly starter variant
    delete process.env.LEMONSQUEEZY_API_KEY;
    expect((await post(lsCheckout, cookie, { plan: "PRO", interval: "month" }, "US")).status).toBe(503);
  });
  it("requires an administrator", async () => {
    expect((await post(lsCheckout, "", { plan: "PRO", interval: "month" }, "US")).status).toBe(401);
  });
  it("portal returns the stored link only when subscribed", async () => {
    const cookie = await adminCookie();
    expect((await post(lsPortal, cookie, {}, "US")).status).toBe(404);
    await applyLemonEvent(parseWebhook(event("subscription_created"))!);
    const res = await post(lsPortal, cookie, {}, "US");
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe("https://shop.lemonsqueezy.com/billing?u=1");
  });
});

describe("entitlements expose the detected region (no selector)", () => {
  async function get(country: string) {
    const cookie = await adminCookie().catch(() => `${SESSION_COOKIE}=${""}`);
    return (await entitlements(new NextRequest("http://localhost/api/billing/entitlements", { headers: { cookie, "cf-ipcountry": country } }))).json();
  }
  it("returns PKR/Safepay quotes for Pakistan and USD/Lemon Squeezy availability elsewhere", async () => {
    const cookie = await adminCookie();
    const call = async (c: string) => (await entitlements(new NextRequest("http://localhost/api/billing/entitlements", { headers: { cookie, "cf-ipcountry": c } }))).json();
    const pk = await call("PK");
    expect(pk.billing).toMatchObject({ region: "PK", currency: "PKR", provider: "SAFEPAY", country: "PK" });
    expect(pk.billing.safepay.quotes.PRO.month.amountPkr).toBe(5250);
    const us = await call("US");
    expect(us.billing).toMatchObject({ region: "INTL", currency: "USD", provider: "LEMONSQUEEZY", country: "US" });
    expect(us.billing.lemonsqueezy.available.PRO).toEqual({ month: true, year: true });
    expect(us.billing.lemonsqueezy.available.STARTER).toEqual({ month: true, year: false });
    void get;
  });
});
