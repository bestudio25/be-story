import { handle, json, body } from "@/lib/api";
import { requireAdmin, hashKeyword } from "@/lib/auth";
import { sql, enqueueJob, wakeWorker } from "@/lib/db";
import { eventDetail, EDITABLE_EVENT_FIELDS } from "@/lib/admin";
import { slugify } from "@/lib/importer";
import { RESERVED_SLUGS } from "@/lib/events";
import { parseFolderId } from "@/lib/drive";

type P = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: P) => {
  await requireAdmin();
  const d = await eventDetail((await params).id);
  return d ? json(d) : json({ error: "Evento não encontrado" }, 404);
});

export const PATCH = handle(async (req: Request, { params }: P) => {
  await requireAdmin();
  const { id } = await params;
  const b = await body<Record<string, unknown>>(req);
  const db = sql();
  const set: Record<string, unknown> = {};
  for (const k of EDITABLE_EVENT_FIELDS) if (k in b) set[k] = b[k] === "" ? null : b[k];
  if ("slug" in set) {
    const s = slugify(String(set.slug ?? ""));
    if (!s || RESERVED_SLUGS.has(s)) return json({ error: "Endereço inválido" }, 400);
    const [dup] = await db`select 1 from events where slug = ${s} and id <> ${id}`;
    if (dup) return json({ error: `O endereço /${s} já está em uso` }, 409);
    set.slug = s;
  }
  if ("drive_folder_id" in set && set.drive_folder_id) {
    const v = String(set.drive_folder_id);
    try { set.drive_folder_id = v.startsWith("local:") ? v : parseFolderId(v); } catch (e) { return json({ error: (e as Error).message }, 400); }
  }
  if ("password" in b) set.password_hash = b.password ? await hashKeyword(String(b.password)) : null;
  if (set.status === "ativo") {
    const [cur] = await db`select status, published_at from events where id = ${id}`;
    if (!cur?.published_at) set.published_at = new Date();
    if (cur?.status === "arquivado") { await db`update files set processing = 'pendente' where event_id = ${id}`; await enqueueJob("reprocess_event", { eventId: id }); await wakeWorker("reativar"); }
  }
  if (!Object.keys(set).length) return json({ error: "Nada para salvar" }, 400);
  set.updated_at = new Date();
  await db`update events set ${db(set as never)} where id = ${id}`;
  return json({ ok: true });
});

export const DELETE = handle(async (_req: Request, { params }: P) => {
  await requireAdmin();
  const { id } = await params;
  await enqueueJob("purge_event", { eventId: id, deleteRow: true });
  await sql()`update events set status = 'arquivado', slug = slug || '-removido-' || substr(md5(random()::text),1,4) where id = ${id}`;
  await wakeWorker("excluir");
  return json({ ok: true });
});
