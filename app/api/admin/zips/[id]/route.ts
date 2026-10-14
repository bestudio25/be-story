import { handle, json } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";

/** Marca o pedido de ZIP como avisado (após mandar o WhatsApp pelo painel). */
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  await sql()`update zip_requests set notified_at = now() where id = ${(await params).id}`;
  return json({ ok: true });
});
