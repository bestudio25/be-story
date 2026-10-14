/** E-mails via Resend (opcional). Sem RESEND_API_KEY, apenas registra no log. */
export async function sendEmail(to: string, subject: string, text: string, html?: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email desativado] ${to} · ${subject}`);
    return false;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "BE Studio <memorias@bestudiomkt.com.br>", to, subject, text, html }),
  });
  return r.ok;
}

/** Aviso interno para a BE Studio (bilhetes, pedidos de ZIP com WhatsApp etc.). */
export async function notifyBe(subject: string, text: string) {
  const to = process.env.BE_NOTIFY_EMAIL || process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) return false;
  return sendEmail(to, `[BE STORY] ${subject}`, text);
}
