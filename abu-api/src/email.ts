/**
 * Email from SolfaScores: sent through Cloudflare's Email Service (the EMAIL binding in wrangler.jsonc) from
 * no-reply@solfascores.com. Sending to any address needs the account on the Workers Paid plan (the owner's decision,
 * 22 November 2026, for Forgot password); the domain is set up for sending in the Cloudflare dashboard.
 */

export const SENDER = { name: 'SolfaScores', email: 'no-reply@solfascores.com' };

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** How email goes out. The tests replace `send`, so they never send any. */
export const mail = {
  async send(env: Env, email: Email): Promise<void> {
    await env.EMAIL.send({ from: SENDER, ...email });
  },
};

/** How long a link to choose a new password works, in seconds. */
export const RESET_LINK_LIFE = 60 * 60;

/** The email with a link to choose a new password. */
export function resetEmail(user: { name: string; email: string }, link: string): Omit<Email, 'to'> {
  const name = user.name.trim();
  const hello = name ? `Hi ${name},` : 'Hello,';
  const asked = `Someone asked to reset the password for your SolfaScores account, ${user.email}.`;
  const lasts = 'The link works for one hour, and only once. If it wasn’t you, ignore this email: your password stays as it is.';
  return {
    subject: 'Choose a new password for SolfaScores',
    text: [hello, '', `${asked} To choose a new one, open this link:`, '', link, '', lasts, '', 'SolfaScores'].join('\n'),
    html: `<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;font-family:Helvetica,Arial,sans-serif;color:#141416;font-size:16px;line-height:1.5;">
<tr><td style="font-size:20px;font-weight:800;padding-bottom:24px;">SolfaScores</td></tr>
<tr><td style="padding-bottom:16px;">${escape(hello)}</td></tr>
<tr><td style="padding-bottom:24px;">${escape(asked)}</td></tr>
<tr><td style="padding-bottom:24px;"><a href="${escape(link)}" style="display:inline-block;background:#D14617;color:#ffffff;font-weight:700;text-decoration:none;padding:14px 24px;border-radius:999px;">Choose a new password</a></td></tr>
<tr><td style="padding-bottom:24px;color:#5B5B63;font-size:14px;">${escape(lasts)}</td></tr>
<tr><td style="color:#5B5B63;font-size:13px;word-break:break-all;">If the button doesn’t work, open this link:<br><a href="${escape(link)}" style="color:#C2410C;">${escape(link)}</a></td></tr>
</table>
</td></tr>
</table>
</body></html>`,
  };
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
