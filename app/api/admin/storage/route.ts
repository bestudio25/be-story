import { handle, json } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";

export const GET = handle(async () => {
  await requireAdmin();
  const rows = await sql()`select id, client_names, status, event_date, expires_at, storage_bytes from events order by storage_bytes desc`;
  return json({ events: rows.map((r) => ({ ...r, storage_bytes: Number(r.storage_bytes) })), total: rows.reduce((s, r) => s + Number(r.storage_bytes), 0) });
});
