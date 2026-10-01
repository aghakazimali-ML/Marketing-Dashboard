import { DASHBOARD_NAME } from "@/lib/brand";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export async function sendInvitationEmail({
  to,
  ownerEmail,
  role,
  inviteUrl,
}: {
  to: string;
  ownerEmail: string;
  role: "ADMIN" | "ANALYST";
  inviteUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVITE_FROM_EMAIL;
  if (!apiKey || !from) {
    return {
      sent: false,
      message: "Email is not configured. Copy the invitation link and share it manually.",
    };
  }

  const roleLabel = role === "ADMIN" ? "administrator" : "analyst";
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        cc: [ownerEmail],
        subject: `You are invited to ${DASHBOARD_NAME}`,
        text: `You have been invited as an ${roleLabel} to ${DASHBOARD_NAME}. Accept your invitation within seven days: ${inviteUrl}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#17313b"><h1 style="font-size:22px">You are invited to ${escapeHtml(DASHBOARD_NAME)}</h1><p>You have been invited as an <strong>${roleLabel}</strong>.</p><p><a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:#0d9488;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none">Accept invitation</a></p><p>This one-time link expires in seven days.</p></div>`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return {
      sent: false,
      message: "The email provider could not be reached. Copy the invitation link and share it manually.",
    };
  }

  if (!response.ok) {
    return {
      sent: false,
      message: `The email provider rejected the invitation (HTTP ${response.status}). Copy the invitation link and share it manually.`,
    };
  }

  return { sent: true, message: `Invitation sent; the installation owner was copied.` };
}