import { DASHBOARD_NAME } from "@/lib/brand";
import { escapeHtml, layout, sendEmail } from "@/lib/email/send";

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
  const roleLabel = role === "ADMIN" ? "administrator" : "analyst";
  const result = await sendEmail({
    to: [to],
    cc: [ownerEmail],
    subject: `You are invited to ${DASHBOARD_NAME}`,
    text: `You have been invited as an ${roleLabel} to ${DASHBOARD_NAME}. Accept your invitation within seven days: ${inviteUrl}`,
    html: layout(
      `You are invited to ${DASHBOARD_NAME}`,
      `<p>You have been invited as an <strong>${escapeHtml(roleLabel)}</strong>.</p><p>This one-time link expires in seven days.</p>`,
      { label: "Accept invitation", url: inviteUrl }
    ),
  });

  if (result.sent) return { sent: true, message: "Invitation sent; the installation owner was copied." };
  if (result.reason === "not_configured")
    return { sent: false, message: "Email is not configured. Copy the invitation link and share it manually." };
  if (result.reason === "unreachable")
    return { sent: false, message: "The email provider could not be reached. Copy the invitation link and share it manually." };
  return {
    sent: false,
    message: `The email provider rejected the invitation (HTTP ${result.status}). Copy the invitation link and share it manually.`,
  };
}
