import { driver, verifyLocalPart, writeLocalPart } from "@/lib/storage";

/** Só no armazenamento local (desenvolvimento): recebe uma parte do upload. Em produção as partes vão direto ao R2. */
export async function PUT(req: Request) {
  if (driver() !== "local") return new Response("Não encontrado", { status: 404 });
  const q = new URL(req.url).searchParams;
  const [key, u, n, e, s] = ["key", "u", "n", "e", "s"].map((k) => q.get(k) || "");
  if (!verifyLocalPart(key, u, n, e, s)) return new Response("Assinatura inválida", { status: 403 });
  await writeLocalPart(u, Number(n), Buffer.from(await req.arrayBuffer()));
  return new Response(null, { status: 200, headers: { ETag: `"${n}"`, "Access-Control-Expose-Headers": "ETag" } });
}
