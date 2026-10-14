import { accessibleEvent } from "@/lib/client-access";
import { handle, json, body } from "@/lib/api";
import { sql } from "@/lib/db";
import { notifyBe } from "@/lib/notify";

type P = { params: Promise<{ slug: string; id: string }> };

export const GET = handle(async (_req: Request, { params }: P) => {
  const { slug, id } = await params;
  const { ev } = await accessibleEvent(slug);
  const [z] = await sql()`select status, progress, size_bytes from zip_requests where id = ${id} and event_id = ${ev.id}`;
  if (!z) return json({ error: "Pedido não encontrado" }, 404);
  return json({ status: z.status, progress: z.progress, size: z.size_bytes ? Number(z.size_bytes) : null });
});

export const PATCH = handle(async (req: Request, { params }: P) => {
  const { slug, id } = await params;
  const { ev } = await accessibleEvent(slug);
  const b = await body<{ email?: string; phone?: string }>(req);
  const email = b.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email) ? b.email.slice(0, 200) : null;
  const phone = b.phone ? b.phone.replace(/\D/g, "").slice(0, 15) || null : null;
  const [z] = await sql()`update zip_requests set notify_email = coalesce(${email}, notify_email), notify_phone = coalesce(${phone}, notify_phone)
                          where id = ${id} and event_id = ${ev.id} returning label, status`;
  if (!z) return json({ error: "Pedido não encontrado" }, 404);
  if (phone) await notifyBe(`ZIP pedido por WhatsApp · ${ev.client_names}`, `${z.label}\nWhatsApp: ${phone}\nO aviso aparece no painel quando o ZIP ficar pronto.`).catch(() => {});
  return json({ ok: true });
});
