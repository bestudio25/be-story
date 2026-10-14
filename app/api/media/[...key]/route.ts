import fs from "node:fs";
import { Readable } from "node:stream";
import { driver, localPath, verifyLocalSig } from "@/lib/storage";

const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", mp4: "video/mp4", mov: "video/quicktime", zip: "application/zip", webp: "image/webp", heic: "image/heic" };

/** Serve arquivos do armazenamento local (somente desenvolvimento), com assinatura e suporte a Range. */
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (driver() !== "local") return new Response("Não encontrado", { status: 404 });
  const { key: parts } = await params;
  const key = parts.map(decodeURIComponent).join("/");
  const u = new URL(req.url);
  const dl = u.searchParams.get("dl") || "";
  if (!verifyLocalSig(key, u.searchParams.get("e"), u.searchParams.get("s"), dl)) return new Response("Link expirado", { status: 403 });
  let p: string;
  try { p = localPath(key); } catch { return new Response("Inválido", { status: 400 }); }
  const st = await fs.promises.stat(p).catch(() => null);
  if (!st) return new Response("Não encontrado", { status: 404 });
  const type = TYPES[key.split(".").pop()!.toLowerCase()] ?? "application/octet-stream";
  const headers: Record<string, string> = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };
  if (dl) headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(dl)}`;
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    headers["Content-Range"] = `bytes ${start}-${end}/${st.size}`;
    headers["Content-Length"] = String(end - start + 1);
    return new Response(Readable.toWeb(fs.createReadStream(p, { start, end })) as ReadableStream, { status: 206, headers });
  }
  headers["Content-Length"] = String(st.size);
  return new Response(Readable.toWeb(fs.createReadStream(p)) as ReadableStream, { headers });
}
