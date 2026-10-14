import { handle, json, body } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";

export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const { ids } = await body<{ ids?: string[] }>(req);
  if (!ids?.length) return json({ error: "Lista vazia" }, 400);
  const db = sql();
  for (const [i, id] of ids.entries()) await db`update chapters set position = ${i} where id = ${id}`;
  return json({ ok: true });
});
