import { accessibleEvent } from "@/lib/client-access";
import { handle, json, body } from "@/lib/api";
import { sql } from "@/lib/db";
import { notifyBe } from "@/lib/notify";

export const POST = handle(async (req: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const { ev } = await accessibleEvent(slug);
  const b = await body<{ name?: string; body?: string; rating?: number | null; allowPublic?: boolean }>(req);
  const name = (b.name ?? "").trim().slice(0, 120);
  const text = (b.body ?? "").trim().slice(0, 3000);
  if (!name || !text) return json({ error: "Escreva seu nome e o recado" }, 400);
  const rating = b.rating && b.rating >= 1 && b.rating <= 5 ? Math.round(b.rating) : null;
  await sql()`insert into notes (event_id, author_name, body, rating, allow_public_use)
              values (${ev.id}, ${name}, ${text}, ${rating}, ${!!b.allowPublic})`;
  await notifyBe(`Novo bilhete de ${name} (${ev.client_names})`,
    `${text}\n\nAvaliação: ${rating ? "★".repeat(rating) : "sem nota"}\nUso público: ${b.allowPublic ? "autorizado" : "não autorizado"}`).catch(() => {});
  return json({ ok: true });
});
