import { handle, json, body } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";
import { keys, signPut, size, deletePrefix } from "@/lib/storage";

type P = { params: Promise<{ id: string }> };
const EXT: Record<string, string> = { "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a", "audio/aac": ".aac", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/ogg": ".ogg" };
const MAX = 40 * 1024 * 1024;

/** 1) pede o endereço de envio da trilha sonora */
export const POST = handle(async (req: Request, { params }: P) => {
  await requireAdmin();
  const { id } = await params;
  const b = await body<{ contentType?: string; size?: number }>(req);
  const ext = EXT[(b.contentType ?? "").toLowerCase()];
  if (!ext) return json({ error: "Envie um arquivo de áudio (MP3, M4A, AAC, WAV ou OGG)" }, 400);
  if ((b.size ?? 0) > MAX) return json({ error: "A música pode ter no máximo 40 MB" }, 400);
  const key = keys.soundtrack(id, Date.now().toString(36), ext);
  return json({ key, url: await signPut(key, b.contentType!) });
});

/** 2) confirma o envio e passa a usar a nova trilha */
export const PUT = handle(async (req: Request, { params }: P) => {
  await requireAdmin();
  const { id } = await params;
  const { key, name } = await body<{ key?: string; name?: string }>(req);
  if (!key || !key.startsWith(`events/${id}/audio/`)) return json({ error: "Arquivo inválido" }, 400);
  if (!(await size(key).catch(() => 0))) return json({ error: "O envio não terminou. Tente de novo." }, 400);
  const db = sql();
  const [old] = await db`select soundtrack_key from events where id = ${id}`;
  await db`update events set soundtrack_key = ${key}, soundtrack_name = ${(name ?? "").slice(0, 200) || null}, updated_at = now() where id = ${id}`;
  if (old?.soundtrack_key && old.soundtrack_key !== key) await deletePrefix(old.soundtrack_key).catch(() => {});
  return json({ ok: true });
});

/** remove a trilha */
export const DELETE = handle(async (_req: Request, { params }: P) => {
  await requireAdmin();
  const { id } = await params;
  const db = sql();
  const [old] = await db`select soundtrack_key from events where id = ${id}`;
  await db`update events set soundtrack_key = null, soundtrack_name = null, updated_at = now() where id = ${id}`;
  if (old?.soundtrack_key) await deletePrefix(old.soundtrack_key).catch(() => {});
  return json({ ok: true });
});
