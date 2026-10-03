/**
 * Plan catalogue: the single source of truth for what each tier includes.
 * Pure data + helpers, safe to import from client and server code.
 * Prices are in Pakistani rupees (PKR). Safepay charges exactly the price computed from this
 * table on the server; Stripe (optional) charges whatever the configured Price IDs say.
 */
export type PlanId = "FREE" | "STARTER" | "PRO" | "EXCLUSIVE";
export const PLAN_ORDER: PlanId[] = ["FREE", "STARTER", "PRO", "EXCLUSIVE"];

export type FeatureKey =
  | "scheduledFetch"
  | "excelPdfExport"
  | "periodComparison"
  | "customRange"
  | "posts"
  | "rawDataExport"
  | "aiInsights"
  | "battleboard"
  | "auditLog"
  | "scheduledReports"
  | "apiAccess"
  | "whiteLabel";

export type Limits = {
  /** Active connected channels (pages / accounts / properties). null = unlimited. */
  channels: number | null;
  /** Owner + team members. null = unlimited. */
  seats: number | null;
  /** How far back dashboards can look. null = unlimited. */
  historyDays: number | null;
  /** AI insight generations per day. 0 = not included. null = unlimited. */
  aiInsightsPerDay: number | null;
  /** API keys that can be active at once. */
  apiKeys: number;
};

export type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  /** Price in Pakistani rupees (whole PKR): per month, and per year when paid yearly (2 months free). */
  pricePkrMonthly: number;
  pricePkrYearly: number;
  limits: Limits;
  features: Record<FeatureKey, boolean>;
  highlights: string[];
};

const none: Record<FeatureKey, boolean> = {
  scheduledFetch: false, excelPdfExport: false, periodComparison: false, customRange: false,
  posts: false, rawDataExport: false, aiInsights: false, battleboard: false, auditLog: false,
  scheduledReports: false, apiAccess: false, whiteLabel: false,
};

export const PLANS: Record<PlanId, Plan> = {
  FREE: {
    id: "FREE",
    name: "Free",
    tagline: "Try it with your main channels",
    pricePkrMonthly: 0,
    pricePkrYearly: 0,
    limits: { channels: 3, seats: 1, historyDays: 30, aiInsightsPerDay: 0, apiKeys: 0 },
    features: { ...none },
    highlights: [
      "3 connected channels",
      "1 user",
      "Last 30 days of history",
      "Manual data fetch",
      "CSV report export",
      "Overview, LinkedIn, Facebook, Instagram, YouTube & Website dashboards",
    ],
  },
  STARTER: {
    id: "STARTER",
    name: "Starter",
    tagline: "For small teams that report every month",
    pricePkrMonthly: 4999,
    pricePkrYearly: 49990,
    limits: { channels: 8, seats: 3, historyDays: 90, aiInsightsPerDay: 0, apiKeys: 0 },
    features: {
      ...none,
      scheduledFetch: true, excelPdfExport: true, periodComparison: true, customRange: true,
      posts: true, rawDataExport: true,
    },
    highlights: [
      "Everything in Free",
      "8 channels · 3 users",
      "90 days of history",
      "Automatic daily fetch",
      "Excel & PDF reports",
      "Period-over-period comparison & custom date ranges",
      "Post performance analytics",
      "Raw daily data export",
    ],
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    tagline: "For agencies and growing marketing teams",
    pricePkrMonthly: 12999,
    pricePkrYearly: 129990,
    limits: { channels: 25, seats: 10, historyDays: 365, aiInsightsPerDay: 30, apiKeys: 0 },
    features: {
      ...none,
      scheduledFetch: true, excelPdfExport: true, periodComparison: true, customRange: true,
      posts: true, rawDataExport: true, aiInsights: true, battleboard: true, auditLog: true,
      scheduledReports: true,
    },
    highlights: [
      "Everything in Starter",
      "25 channels · 10 users",
      "12 months of history",
      "AI insights (OpenAI, Claude, Grok, Gemini)",
      "LinkedIn Battleboard rankings",
      "Scheduled email reports",
      "Audit log for admins",
    ],
  },
  EXCLUSIVE: {
    id: "EXCLUSIVE",
    name: "Exclusive",
    tagline: "Everything, with no limits",
    pricePkrMonthly: 39999,
    pricePkrYearly: 399990,
    limits: { channels: null, seats: null, historyDays: null, aiInsightsPerDay: null, apiKeys: 5 },
    features: {
      scheduledFetch: true, excelPdfExport: true, periodComparison: true, customRange: true,
      posts: true, rawDataExport: true, aiInsights: true, battleboard: true, auditLog: true,
      scheduledReports: true, apiAccess: true, whiteLabel: true,
    },
    highlights: [
      "Everything in Pro",
      "Unlimited channels, users & history",
      "Unlimited AI insights",
      "Read-only REST API with API keys",
      "White-label: your own product name",
      "Priority support",
    ],
  },
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  scheduledFetch: "Automatic daily fetch",
  excelPdfExport: "Excel & PDF reports",
  periodComparison: "Period comparison",
  customRange: "Custom date ranges",
  posts: "Post analytics",
  rawDataExport: "Raw data export",
  aiInsights: "AI insights",
  battleboard: "LinkedIn Battleboard",
  auditLog: "Audit log",
  scheduledReports: "Scheduled email reports",
  apiAccess: "REST API access",
  whiteLabel: "White-label branding",
};

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_ORDER as string[]).includes(value);
}

export function getPlan(id: PlanId | string | null | undefined): Plan {
  return isPlanId(id) ? PLANS[id] : PLANS.FREE;
}

/** The cheapest plan that includes a feature (used for upgrade prompts). */
export function planRequiredFor(feature: FeatureKey): Plan {
  return PLAN_ORDER.map((id) => PLANS[id]).find((p) => p.features[feature]) ?? PLANS.EXCLUSIVE;
}

export function planRank(id: PlanId) {
  return PLAN_ORDER.indexOf(id);
}

/** Free-tier date presets (custom ranges and long windows are paid features). */
export const FREE_PRESETS = ["last_7", "last_30"];

export type BillingInterval = "month" | "year";

export function pricePkr(plan: PlanId, interval: BillingInterval): number {
  const p = PLANS[plan];
  return interval === "year" ? p.pricePkrYearly : p.pricePkrMonthly;
}

/** "Rs 4,999" */
export function formatPkr(amount: number): string {
  return amount === 0 ? "Free" : `Rs ${new Intl.NumberFormat("en-PK").format(amount)}`;
}
