import { handle, json, body } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";
import { signPart } from "@/lib/storage";

export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const { id, parts } = await body<{ id?: string; parts?: number[] }>(req);
  const [u] = await sql()`select key, upload_id from uploads where id = ${id ?? ""}`;
  if (!u || !parts?.length) return json({ error: "Envio não encontrado" }, 404);
  const urls = await Promise.all(parts.slice(0, 50).map(async (n) => ({ n, url: await signPart(u.key, u.upload_id, n) })));
  return json({ urls });
});
