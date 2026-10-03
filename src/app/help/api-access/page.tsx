import Link from "next/link";

export const metadata = { title: "API access setup guide" };

/** In-app guide for connecting channels (full version: README, "Connecting your channels"). */
export default function ApiAccessHelp() {
  const h2 = "mt-8 font-display text-xl text-navy-900";
  return (
    <div className="app-stage min-h-screen px-4 py-10">
      <article className="crazy-card mx-auto max-w-3xl rounded-2xl p-8 text-sm leading-relaxed text-ink">
        <Link href="/sync" className="text-xs font-medium text-teal-600 hover:underline">← Back to Pages &amp; Fetch</Link>
        <h1 className="mt-3 font-display text-3xl text-navy-900">Connect your channels</h1>
        <p className="mt-2 text-muted">The easiest way is the <strong>Connect</strong> button next to a channel. It needs OAuth app credentials configured by whoever runs this installation (see the README section “Connecting your channels”). You can always paste credentials manually under <em>Advanced</em>.</p>

        <h2 className={h2}>Google Analytics 4</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>In Google Cloud, create a service account and download its JSON key.</li>
          <li>In GA4 → Admin → Property access management, add the service account email as a <strong>Viewer</strong>.</li>
          <li>Add a Website channel, enter the numeric property ID, open <em>Advanced</em>, and paste the JSON key. Tokens are minted automatically.</li>
        </ol>

        <h2 className={h2}>YouTube</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Add the channel ID (starts with <code>UC</code>).</li>
          <li>Press <strong>Connect with Google</strong> and approve the YouTube Analytics scope. This unlocks views, watch time and subscriber gains.</li>
        </ol>

        <h2 className={h2}>Facebook &amp; Instagram</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Use the Page ID (Facebook) or Instagram Business account ID.</li>
          <li>Press <strong>Connect with Meta</strong>. Page tokens do not expire; user tokens are extended automatically.</li>
          <li>Instagram insights need a professional (Business/Creator) account linked to a Facebook Page.</li>
        </ol>

        <h2 className={h2}>LinkedIn</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>You need access to LinkedIn&apos;s Community Management API for your app.</li>
          <li>Enter the organization ID and press <strong>Connect with LinkedIn</strong>. You must be an admin of the page.</li>
        </ol>

        <h2 className={h2}>If a channel shows “Needs reconnect”</h2>
        <p className="mt-2">Its authorization expired or was revoked. Press <strong>Reconnect</strong>. Administrators are also emailed when this happens and 7 days before a known expiry.</p>
      </article>
    </div>
  );
}
