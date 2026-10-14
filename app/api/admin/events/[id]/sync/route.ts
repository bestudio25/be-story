import { handle, json } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { wakeWorker } from "@/lib/db";
import { syncEvent } from "@/lib/importer";
import { driveError } from "@/lib/admin";

export const maxDuration = 26;

/** "Gerar site" / "Sincronizar": lê a pasta do Drive e coloca os arquivos novos na fila de processamento. */
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  try {
    const r = await syncEvent((await params).id);
    const woke = await wakeWorker("sincronizar");
    return json({ ...r, worker: woke });
  } catch (e) {
    return json({ error: driveError(e) }, 400);
  }
});
