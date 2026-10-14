import { handle, json, body } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";

export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const b = await body<{ eventId?: string; parentId?: string | null; name?: string }>(req);
  if (!b.eventId || !b.name?.trim()) return json({ error: "Informe o nome" }, 400);
  const db = sql();
  const [m] = await db`select coalesce(max(position),-1)+1 as p from chapters where event_id = ${b.eventId} and parent_id is not distinct from ${b.parentId ?? null}`;
  const [c] = await db`insert into chapters (event_id, parent_id, name, position) values (${b.eventId}, ${b.parentId ?? null}, ${b.name.trim()}, ${m.p}) returning id`;
  return json({ id: c.id });
});

export const PATCH = handle(async (req: Request) => {
  await requireAdmin();
  const b = await body<{ id?: string; name?: string; description?: string | null; icon?: string; color?: string | null; is_internal?: boolean; cover_file_id?: string | null; parent_id?: string | null }>(req);
  if (!b.id) return json({ error: "Capítulo inválido" }, 400);
  const set: Record<string, unknown> = {};
  for (const k of ["name", "description", "icon", "color", "is_internal", "cover_file_id", "parent_id"] as const) if (k in b) set[k] = b[k] === "" ? null : b[k];
  if (set.parent_id === b.id) return json({ error: "Um capítulo não pode ficar dentro dele mesmo" }, 400);
  const db = sql();
  await db`update chapters set ${db(set as never)} where id = ${b.id}`;
  return json({ ok: true });
});

export const DELETE = handle(async (req: Request) => {
  await requireAdmin();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return json({ error: "Capítulo inválido" }, 400);
  const db = sql();
  const [c] = await db`select parent_id from chapters where id = ${id}`;
  // arquivos e subpastas sobem para o capítulo pai
  await db`update files set chapter_id = ${c?.parent_id ?? null} where chapter_id = ${id}`;
  await db`update chapters set parent_id = ${c?.parent_id ?? null} where parent_id = ${id}`;
  await db`delete from chapters where id = ${id}`;
  return json({ ok: true });
});
