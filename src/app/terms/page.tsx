import type { Metadata } from "next";
import { Contact, LegalPage, Section } from "@/components/legal/legal-page";
import { getLegalInfo } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  const i = getLegalInfo();
  return (
    <LegalPage
      title="Terms of Service"
      intro={`These terms are an agreement between you (the organisation or person using the service) and ${i.company} ("we", "us"). By creating an account or using ${i.product} you accept them. If you do not agree, do not use the service.`}
    >
      <Section title="1. The service">
        <p>{i.product} is a web dashboard that collects performance data from marketing channels you connect (such as LinkedIn, Facebook, Instagram, YouTube and Google Analytics 4) and presents it as dashboards, reports and optional AI-written insights. Features depend on your plan (Free, Starter, Pro or Exclusive).</p>
        <p>Each customer is served from its own installation and database. Your data is not mixed with other customers&apos; data.</p>
      </Section>
      <Section title="2. Accounts and security">
        <p>The first person to set up an installation becomes its administrator. Administrators can invite teammates as Analysts (view only) or Administrators (manage channels, team and billing). You are responsible for activity under your accounts, for choosing strong passwords (at least 12 characters), and for removing people who should no longer have access.</p>
        <p>Tell us promptly if you suspect unauthorised access. We may suspend access where needed to protect the service or other users.</p>
      </Section>
      <Section title="3. Your data and connected channels">
        <p>You keep ownership of your data. You give us permission to access the channels you connect, only to retrieve the analytics shown in the service. You confirm you are allowed to connect those channels and that doing so complies with each platform&apos;s own terms. Access credentials you provide are stored encrypted. You can disconnect a channel or revoke access at any time, including from the platform itself.</p>
        <p>Third-party platforms control their own data and APIs. They may limit, change or withdraw access, and we are not responsible for data they do not provide. A dash (—) in the service means a platform did not report that figure.</p>
      </Section>
      <Section title="4. Acceptable use">
        <p>You agree not to: break the law or any platform&apos;s terms; attempt to access data that is not yours; probe, overload or reverse-engineer the service; share credentials; or use the API or exports to build a competing product.</p>
      </Section>
      <Section title="5. Plans, prices and payment">
        <p>Plans, features and limits are shown on the Plan &amp; Billing page. Prices are shown in Pakistani rupees (PKR) for customers in Pakistan and in US dollars (USD) for everyone else; the currency is chosen from your detected location.</p>
        <p><strong>Pakistan (PKR):</strong> payments are processed by Safepay. Plans are prepaid for one month or one year. Renewing extends your period, and upgrading credits the unused days of your current period. <strong>All other countries (USD):</strong> subscriptions are sold and billed by Lemon Squeezy, our merchant of record, which also collects applicable taxes. Subscriptions renew automatically until cancelled; you can cancel any time from Manage subscription.</p>
        <p>We never see or store your card details. If a paid period ends without renewal, the workspace returns to the Free plan: your data is kept, but paid features lock and Free limits apply. Prices may change for future periods with notice. Refunds are covered by the <a className="font-medium text-teal-700 hover:underline" href="/refund-policy">Refund Policy</a>.</p>
      </Section>
      <Section title="6. Availability and changes">
        <p>We aim to keep the service available but do not promise uninterrupted operation. Data can only be as fresh as your last fetch. We may improve, change or remove features; if we remove a paid feature, we will give reasonable notice.</p>
      </Section>
      <Section title="7. Intellectual property">
        <p>We own the software, design and documentation. We give you a limited, non-exclusive, non-transferable right to use the service during your plan. You keep your data, logos and content. Where your plan includes white-labelling, you may show your own product name inside your workspace.</p>
      </Section>
      <Section title="8. AI insights">
        <p>If you enable AI Insights, aggregate metrics for the period you choose are sent to the AI provider you configure, using your own API key. Insights are automated suggestions, may contain errors and are not professional advice; check them before acting.</p>
      </Section>
      <Section title="9. Disclaimer and liability">
        <p>The service is provided “as is” and “as available”. To the fullest extent the law allows, we are not liable for indirect or consequential loss, lost profits or lost business, and our total liability for any claim is limited to the amount you paid for the service in the three months before the claim arose. Nothing here limits liability that cannot lawfully be limited.</p>
      </Section>
      <Section title="10. Ending the agreement">
        <p>You may stop using the service at any time and ask us to delete your data. We may suspend or end your access if you seriously or repeatedly breach these terms, or if payment obligations are not met, after notice where reasonable. Sections that by nature should survive (ownership, liability, governing law) continue after the agreement ends.</p>
      </Section>
      <Section title="11. Changes to these terms">
        <p>We may update these terms. We will show the new effective date and, for material changes, notify administrators. Continuing to use the service after that means you accept the updated terms.</p>
      </Section>
      <Section title="12. Governing law">
        <p>These terms are governed by the laws of {i.governingLaw}, and the courts of {i.governingLaw} have jurisdiction, unless mandatory local law says otherwise.</p>
      </Section>
      <Section title="13. Contact">
        <Contact label="Questions about these terms" />
      </Section>
    </LegalPage>
  );
}
