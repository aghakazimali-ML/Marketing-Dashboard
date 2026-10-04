import { DASHBOARD_NAME } from "@/lib/brand";
import { getEnv } from "@/lib/config";

/** Details of the business operating this installation, shown on the legal pages. Set via COMPANY_* / SUPPORT_EMAIL env vars. */
export function getLegalInfo() {
  const env = getEnv();
  const country = env.COMPANY_COUNTRY?.trim() || "Pakistan";
  return {
    product: DASHBOARD_NAME,
    company: env.COMPANY_NAME?.trim() || `${DASHBOARD_NAME} (the operator)`,
    address: env.COMPANY_ADDRESS?.trim() || null,
    country,
    supportEmail: env.SUPPORT_EMAIL?.trim() || null,
    effective: env.LEGAL_EFFECTIVE_DATE?.trim() || "4 October 2026",
    refundDays: env.REFUND_WINDOW_DAYS,
    governingLaw: country,
  };
}

export type LegalInfo = ReturnType<typeof getLegalInfo>;
