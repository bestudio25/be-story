import { ImageResponse } from "next/og";
import fs from "node:fs/promises";
import path from "node:path";
import { getEventBySlug } from "@/lib/events";
import { sql } from "@/lib/db";
import { signedUrl } from "@/lib/storage";

export const runtime = "nodejs";

const font = (f: string) => fs.readFile(path.join(process.cwd(), "og-fonts", f));
const dateShort = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCFullYear()).slice(2)}`;
const dateLong = (d: Date) => d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Imagem de compartilhamento (WhatsApp): Polaroid com a capa + nomes. Não revela fotos se houver palavra-chave? A capa é escolhida pela BE. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ev = await getEventBySlug(slug);
  if (!ev || ev.status === "rascunho") return new Response("Não encontrado", { status: 404 });
  const fid = ev.polaroid_file_id ?? ev.cover_file_id;
  let photo: string | undefined;
  const [f] = fid
    ? await sql()`select poster_key from files where id = ${fid}`
    : await sql()`select poster_key from files where event_id = ${ev.id} and kind = 'foto' and processing = 'pronto' order by is_highlight desc, position limit 1`;
  if (f?.poster_key) photo = new URL((await signedUrl(f.poster_key, { expires: 600 }))!, req.url).toString();
  const logo = `data:image/png;base64,${(await fs.readFile(path.join(process.cwd(), "public/brand/be-logo-cream.png"))).toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0f0d0b", color: "#faf8f4", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", background: "radial-gradient(60% 70% at 30% 0%, rgba(255,226,180,.16), rgba(0,0,0,0) 70%)" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 520, height: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column", background: "#f6f1e7", padding: "22px 22px 0", transform: "rotate(-3deg)", boxShadow: "0 30px 60px rgba(0,0,0,.6)" }}>
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} width={330} height={330} style={{ objectFit: "cover" }} alt="" />
            ) : (
              <div style={{ width: 330, height: 330, background: "#353b35", display: "flex" }} />
            )}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0 18px" }}>
              <div style={{ fontFamily: "Gentlemens", fontSize: 44, color: "#2b2420" }}>{ev.client_names}</div>
              <div style={{ fontFamily: "Poppins", fontSize: 14, letterSpacing: 5, color: "#6b5d52", marginTop: 2 }}>{dateShort(ev.event_date)}</div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, paddingRight: 70 }}>
          <div style={{ fontFamily: "Poppins", fontSize: 18, letterSpacing: 8, color: "#c9a77c" }}>BE STORY · MEMÓRIAS</div>
          <div style={{ fontFamily: "Baskerville", fontSize: ev.client_names.length > 18 ? 64 : 78, lineHeight: 1.05, marginTop: 22 }}>{ev.client_names}</div>
          <div style={{ fontFamily: "BaskervilleItalic", fontSize: 28, color: "rgba(250,248,244,.7)", marginTop: 18 }}>{dateLong(ev.event_date)}</div>
          <div style={{ fontFamily: "BaskervilleItalic", fontSize: 24, color: "rgba(250,248,244,.55)", marginTop: 34 }}>Para guardar, lembrar e reviver.</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={70} height={64} style={{ marginTop: 40, opacity: 0.9 }} alt="" />
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Baskerville", data: await font("libre-baskerville-latin-400-normal.woff"), style: "normal", weight: 400 },
        { name: "BaskervilleItalic", data: await font("libre-baskerville-latin-400-italic.woff"), style: "normal", weight: 400 },
        { name: "Poppins", data: await font("poppins-latin-500-normal.woff"), style: "normal", weight: 500 },
        { name: "Gentlemens", data: await font("gentlemens-script.woff"), style: "normal", weight: 400 },
      ],
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}
