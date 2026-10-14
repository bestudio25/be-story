import { handle, json, body } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";
import { createMultipart, listParts, keys, PART_SIZE } from "@/lib/storage";
import { randomUUID } from "node:crypto";

/** Inicia (ou retoma) o envio de um arquivo grande em partes. */
export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const b = await body<{ eventId?: string; relativePath?: string; size?: number; lastModified?: number; type?: string }>(req);
  if (!b.eventId || !b.relativePath || !b.size) return json({ error: "Dados inválidos" }, 400);
  const db = sql();
  const [prev] = await db`select id, key, upload_id from uploads where event_id = ${b.eventId} and relative_path = ${b.relativePath}
                           and size_bytes = ${b.size} and last_modified is not distinct from ${b.lastModified ?? null} and not completed
                           order by created_at desc limit 1`;
  if (prev) {
    const parts = await listParts(prev.key, prev.upload_id).catch(() => null);
    if (parts) return json({ id: prev.id, partSize: PART_SIZE, done: parts.map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag })) });
  }
  const ext = (b.relativePath.match(/\.[^./]+$/)?.[0] ?? "").toLowerCase();
  const key = keys.upload(b.eventId, randomUUID(), ext);
  const uploadId = await createMultipart(key, b.type || "application/octet-stream");
  const [u] = await db`insert into uploads (event_id, relative_path, key, upload_id, size_bytes, last_modified)
                       values (${b.eventId}, ${b.relativePath}, ${key}, ${uploadId}, ${b.size}, ${b.lastModified ?? null}) returning id`;
  return json({ id: u.id, partSize: PART_SIZE, done: [] });
});
