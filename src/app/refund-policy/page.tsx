import type { Metadata } from "next";
import { Contact, LegalPage, Section } from "@/components/legal/legal-page";
import { getLegalInfo } from "@/lib/legal";

export const metadata: Metadata = { title: "Refund Policy" };

export default function RefundPolicyPage() {
  const i = getLegalInfo();
  const d = i.refundDays;
  return (
    <LegalPage
      title="Refund Policy"
      intro={`We want you to be happy with ${i.product}. This page explains when you can get your money back and how plan changes are handled.`}
    >
      <Section title="1. Free plan">
        <p>The Free plan costs nothing, so you can try the dashboards before you buy a paid plan.</p>
      </Section>
      <Section title="2. Refund window">
        {d > 0 ? (
          <p>If you are not satisfied with a paid plan, ask for a refund within <strong>{d} days</strong> of your first purchase and we will refund that payment in full. Renewals and later purchases are not refundable once the new period has started, unless the service was unavailable or materially not as described.</p>
        ) : (
          <p>Paid plans are not refundable once purchased, unless the service was unavailable or materially not as described.</p>
        )}
      </Section>
      <Section title="3. Customers in Pakistan (Safepay, PKR)">
        <p>Plans are prepaid for one month or one year. There is no automatic renewal: nothing is charged again unless you choose to renew. When you upgrade during a paid period, the unused days of your current plan are credited towards the new one. Approved refunds are returned to the original payment method through Safepay; timing depends on your bank or wallet.</p>
      </Section>
      <Section title="4. Customers in other countries (Lemon Squeezy, USD)">
        <p>Subscriptions are sold by Lemon Squeezy as merchant of record and renew automatically until you cancel. You can cancel at any time from Manage subscription, and your plan stays active until the end of the period you paid for. Refund requests within the window above are processed through Lemon Squeezy to your original payment method.</p>
      </Section>
      <Section title="5. When a plan ends">
        <p>If a paid period ends, the workspace returns to the Free plan. Your data is kept, but paid features lock and Free limits apply. You can upgrade again at any time.</p>
      </Section>
      <Section title="6. How to ask">
        <Contact label="To request a refund, write to us with your account email and payment reference" />
      </Section>
    </LegalPage>
  );
}
