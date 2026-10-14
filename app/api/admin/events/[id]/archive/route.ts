import { handle, json } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { sql, enqueueJob, wakeWorker } from "@/lib/db";

/** Arquiva: remove as versões web e cópias do R2; os originais continuam no Drive. */
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await params;
  await sql()`update events set status = 'arquivado', updated_at = now() where id = ${id}`;
  await enqueueJob("purge_event", { eventId: id });
  await wakeWorker("arquivar");
  return json({ ok: true });
});
