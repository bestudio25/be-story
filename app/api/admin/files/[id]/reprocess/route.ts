import { handle, json, body } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { sql, enqueueJob, wakeWorker } from "@/lib/db";

/** Reprocessa um arquivo; com posterTime, gera só o novo poster frame do vídeo. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await params;
  const { posterTime } = await body<{ posterTime?: number }>(req);
  if (typeof posterTime === "number") {
    await sql()`update files set poster_time_sec = ${Math.max(0, posterTime)} where id = ${id}`;
    await enqueueJob("poster_frame", { fileId: id });
  } else {
    await sql()`update files set processing = 'pendente', processing_error = null where id = ${id}`;
    await enqueueJob("process_file", { fileId: id }, { dedupe: true });
  }
  await wakeWorker("reprocessar");
  return json({ ok: true });
});
