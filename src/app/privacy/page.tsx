import type { Metadata } from "next";
import { Contact, LegalPage, Section } from "@/components/legal/legal-page";
import { getLegalInfo } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  const i = getLegalInfo();
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`This policy explains what personal data ${i.product} handles, why, and the choices you have. ${i.company} operates this installation and is responsible for the data described below.`}
    >
      <Section title="1. Data we handle">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Account data:</strong> your name, email address, role and a one-way hash of your password (we cannot read your password).</li>
          <li><strong>Connected channel data:</strong> daily performance figures and post information (for example followers, reach, impressions, engagement, clicks and post titles or links) retrieved from the LinkedIn, Facebook, Instagram, YouTube and Google Analytics accounts you connect. This is business analytics, not data about your own followers or visitors as individuals.</li>
          <li><strong>Access credentials:</strong> access tokens or API keys you provide so we can fetch that data. They are encrypted before storage and never shown again in the browser.</li>
          <li><strong>Security and audit records:</strong> sign-ins, failed attempts, lockouts, password changes, invitations, fetches and billing events, with timestamps and IP addresses.</li>
          <li><strong>Billing records:</strong> plan, period dates, payment status and reference numbers. Card or bank details are handled only by our payment providers.</li>
        </ul>
      </Section>
      <Section title="2. Why we use it">
        <p>To provide and secure the service (sign-in, dashboards, reports, team access); to detect abuse and keep an audit trail; to take payment and manage your plan; to send service emails (invitations, password resets, connection alerts and scheduled reports you switch on); and to meet legal obligations. We do not sell your data and do not use it for advertising.</p>
      </Section>
      <Section title="3. Who else handles data">
        <p>We use these providers only as needed to run the service:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Hosting and database:</strong> the server and PostgreSQL database where this installation runs.</li>
          <li><strong>Google, Meta and LinkedIn:</strong> the platforms whose APIs we call, with the access you authorise.</li>
          <li><strong>Safepay</strong> (customers in Pakistan) and <strong>Lemon Squeezy</strong> (all other countries, as merchant of record): payment processing and tax.</li>
          <li><strong>Resend:</strong> delivery of service emails.</li>
          <li><strong>An IP-location service:</strong> your IP address may be sent to a geolocation service to detect your country and show the right currency. No other personal data is sent.</li>
          <li><strong>Your chosen AI provider</strong> (OpenAI, Anthropic Claude, xAI Grok or Google Gemini), only if an administrator enables AI Insights: aggregate period metrics are sent using your own API key. Post text, tokens and credentials are not.</li>
        </ul>
      </Section>
      <Section title="4. Cookies and local storage">
        <p>We use one essential session cookie to keep you signed in (secure, HTTP-only, and expires automatically), and your browser may store your light/dark theme choice. We do not use advertising or tracking cookies.</p>
      </Section>
      <Section title="5. How we protect it">
        <p>Passwords are hashed; channel credentials are encrypted at rest; connections use HTTPS; sign-in is rate-limited with lockout; sessions are revoked when passwords or roles change; API keys are stored as hashes; and administrators on suitable plans can review an audit log. No system is perfectly secure, so please use strong passwords and remove accounts you no longer need.</p>
      </Section>
      <Section title="6. How long we keep it">
        <p>We keep account and channel data while your installation is active. Audit records are kept for security and accountability. If your plan ends, your data stays under the Free plan. When you ask us to delete your installation, we remove the database and backups within a reasonable period, except records we must keep by law (for example payment records).</p>
      </Section>
      <Section title="7. Your rights">
        <p>You can ask to access, correct, export or delete your personal data, or to object to how it is used. Administrators can disable users and disconnect channels at any time, and you can revoke our access from within Google, Meta or LinkedIn. We will respond within a reasonable time. You may also complain to your local data-protection authority.</p>
      </Section>
      <Section title="8. International transfers">
        <p>Some providers listed above operate in other countries, so data may be processed outside your own. We choose providers that protect data to a comparable standard.</p>
      </Section>
      <Section title="9. Children">
        <p>The service is for businesses and is not directed to anyone under 18.</p>
      </Section>
      <Section title="10. Changes">
        <p>We will update this page when our practices change and show the new effective date above.</p>
      </Section>
      <Section title="11. Contact">
        <Contact label="Privacy questions or requests" />
      </Section>
    </LegalPage>
  );
}
