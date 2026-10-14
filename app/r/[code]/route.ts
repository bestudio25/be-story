import { sql, hasDb, track } from "@/lib/db";
import { BE_WHATSAPP } from "@/lib/events";

/** Link de indicação rastreável → WhatsApp da BE com mensagem pronta. */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let names = "";
  if (hasDb() && /^[a-z0-9]{4,12}$/.test(code)) {
    const [r] = await sql()`update referrals set clicks = clicks + 1 where code = ${code}
                            returning event_id, (select client_names from events where id = referrals.event_id) as names`;
    if (r) { names = r.names; await track(r.event_id, "referral_click", { meta: { code } }); }
  }
  const msg = names
    ? `Oi, BE! Vim por indicação de ${names} (código ${code}) e quero saber sobre a cobertura do meu evento.`
    : "Oi, BE! Quero saber sobre a cobertura do meu evento.";
  return Response.redirect(`https://wa.me/${BE_WHATSAPP()}?text=${encodeURIComponent(msg)}`, 302);
}
