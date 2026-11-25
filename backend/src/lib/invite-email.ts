export type InviteEmailInput = {
  name: string;
  link: string;
  hours: number;
  schoolName: string;
};

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Invitation email. Carries the single-use link and its expiry; never a
 * password and never the inviter's personal data.
 */
export function renderInviteEmail({
  name,
  link,
  hours,
  schoolName,
}: InviteEmailInput): RenderedEmail {
  const subject = "Set your Lumina ESL password";
  const text = [
    `Hello ${name},`,
    "",
    `An account has been created for you at ${schoolName}.`,
    "Open this link to set your password and activate your account:",
    "",
    link,
    "",
    `The link works once and expires in ${hours} hours.`,
    "If you did not expect this email, you can ignore it.",
  ].join("\n");
  const safeLink = escapeHtml(link);
  const html = [
    `<p>Hello ${escapeHtml(name)},</p>`,
    `<p>An account has been created for you at ${escapeHtml(schoolName)}.</p>`,
    "<p>Open this link to set your password and activate your account:</p>",
    `<p><a href="${safeLink}">${safeLink}</a></p>`,
    `<p>The link works once and expires in ${hours} hours.</p>`,
    "<p>If you did not expect this email, you can ignore it.</p>",
  ].join("\n");
  return { subject, text, html };
}
