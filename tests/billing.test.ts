import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { PLANS, PLAN_ORDER, planRequiredFor, getPlan } from "@/lib/billing/plans";
import { clampRangeToPlan, getWorkspace, licensedPlan } from "@/lib/billing/workspace";
import { applySubscription, planForPriceId, priceIdFor } from "@/lib/billing/stripe";
import { resolveDateRange } from "@/lib/metrics/periods";
import { digestDue } from "@/lib/reports/digest";
import { generateApiKey, hashApiKey, authenticateApiKey } from "@/lib/api-keys";
import { POST as webhook } from "@/app/api/billing/webhook/route";

beforeEach(async () => {
  await prisma.workspace.deleteMany();
  await prisma.stripeEvent.deleteMany();
  await prisma.apiKey.deleteMany();
  delete process.env.LICENSE_PLAN;
  process.env.STRIPE_PRICE_STARTER_MONTHLY = "price_starter_m";
  process.env.STRIPE_PRICE_PRO_YEARLY = "price_pro_y";
});

describe("plan catalogue", () => {
  it("every higher plan includes everything the lower plan has (Exclusive has it all)", () => {
    for (let i = 1; i < PLAN_ORDER.length; i++) {
      const lo = PLANS[PLAN_ORDER[i - 1]];
      const hi = PLANS[PLAN_ORDER[i]];
      for (const f of Object.keys(lo.features) as (keyof typeof lo.features)[]) {
        if (lo.features[f]) expect(hi.features[f], `${hi.id} lacks ${f}`).toBe(true);
      }
      for (const k of ["channels", "seats", "historyDays"] as const) {
        const a = lo.limits[k];
        const b = hi.limits[k];
        expect(b === null || (a !== null && b >= a)).toBe(true);
      }
    }
    expect(Object.values(PLANS.EXCLUSIVE.features).every(Boolean)).toBe(true);
  });
  it("finds the cheapest plan with a feature", () => {
    expect(planRequiredFor("aiInsights").id).toBe("PRO");
    expect(planRequiredFor("apiAccess").id).toBe("EXCLUSIVE");
    expect(planRequiredFor("excelPdfExport").id).toBe("STARTER");
  });
});

describe("workspace plan resolution", () => {
  it("defaults to Free", async () => {
    expect((await getWorkspace()).planId).toBe("FREE");
  });
  it("an operator licence overrides Stripe state", async () => {
    process.env.LICENSE_PLAN = "pro";
    expect(licensedPlan()).toBe("PRO");
    expect((await getWorkspace()).planId).toBe("PRO");
  });
  it("past-due keeps access, canceled falls back to Free", async () => {
    await prisma.workspace.create({ data: { id: 1, plan: "PRO", planStatus: "past_due" } });
    expect((await getWorkspace()).planId).toBe("PRO");
    await prisma.workspace.update({ where: { id: 1 }, data: { planStatus: "canceled" } });
    expect((await getWorkspace()).planId).toBe("FREE");
  });
  it("clamps history to the plan window", () => {
    const now = new Date(2026, 8, 30);
    const range = resolveDateRange("last_6_months", undefined, undefined, now);
    const clamped = clampRangeToPlan(range, getPlan("FREE"), now);
    expect(Math.round((now.getTime() - clamped.start.getTime()) / 86_400_000)).toBeLessThanOrEqual(30);
    expect(clampRangeToPlan(range, getPlan("EXCLUSIVE"), now).start).toEqual(range.start);
  });
});

describe("Stripe subscription mapping", () => {
  it("maps price ids to plans and back", () => {
    expect(planForPriceId("price_pro_y")).toEqual({ plan: "PRO", interval: "year" });
    expect(priceIdFor("STARTER", "month")).toBe("price_starter_m");
    expect(planForPriceId("price_unknown")).toBeNull();
  });
  const snap = (over = {}) => ({ id: "sub_1", customerId: "cus_1", status: "active", priceId: "price_pro_y", currentPeriodEnd: new Date(), cancelAtPeriodEnd: false, ...over });
  it("activates a known price, ignores unknown prices, ends on cancel", async () => {
    expect(await applySubscription(snap())).toBe("PRO");
    expect((await getWorkspace()).planId).toBe("PRO");
    expect(await applySubscription(snap({ priceId: "price_unknown" }))).toBe("FREE");
    expect(await applySubscription(snap({ status: "canceled" }))).toBe("FREE");
    expect((await prisma.workspace.findUnique({ where: { id: 1 } }))?.stripeSubscriptionId).toBeNull();
  });
});

describe("Stripe webhook", () => {
  it("rejects missing/invalid signatures and unconfigured servers", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect((await webhook(new NextRequest("http://localhost/api/billing/webhook", { method: "POST", body: "{}" }))).status).toBe(503);
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    expect((await webhook(new NextRequest("http://localhost/api/billing/webhook", { method: "POST", body: "{}" }))).status).toBe(400);
    const bad = new NextRequest("http://localhost/api/billing/webhook", { method: "POST", body: "{}", headers: { "stripe-signature": "t=1,v1=deadbeef" } });
    expect((await webhook(bad)).status).toBe(400);
    expect(await prisma.workspace.count()).toBe(0);
  });
});

describe("API keys (Exclusive)", () => {
  it("stores only a hash and authenticates by Bearer header", async () => {
    const { key, prefix, hash } = generateApiKey();
    expect(hash).toBe(hashApiKey(key));
    expect(key.startsWith(prefix)).toBe(true);
    const row = await prisma.apiKey.create({ data: { name: "t", prefix, keyHash: hash, createdBy: "a@x.com" } });
    expect((await authenticateApiKey(`Bearer ${key}`))?.id).toBe(row.id);
    expect(await authenticateApiKey(`Bearer ${key}x`)).toBeNull();
    expect(await authenticateApiKey("Bearer nope")).toBeNull();
    await prisma.apiKey.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    expect(await authenticateApiKey(`Bearer ${key}`)).toBeNull();
  });
});

describe("scheduled digest", () => {
  it("is due weekly/monthly after the interval only", () => {
    const now = new Date("2026-10-10T08:00:00Z");
    expect(digestDue("NONE", null, now)).toBe(false);
    expect(digestDue("WEEKLY", null, now)).toBe(true);
    expect(digestDue("WEEKLY", new Date("2026-10-08T08:00:00Z"), now)).toBe(false);
    expect(digestDue("WEEKLY", new Date("2026-10-03T07:00:00Z"), now)).toBe(true);
    expect(digestDue("MONTHLY", new Date("2026-09-20T08:00:00Z"), now)).toBe(false);
  });
});
