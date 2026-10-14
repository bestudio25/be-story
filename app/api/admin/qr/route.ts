import QRCode from "qrcode";
import { requireAdmin } from "@/lib/auth";
import { handle } from "@/lib/api";

export const GET = handle(async (req: Request) => {
  await requireAdmin();
  const text = new URL(req.url).searchParams.get("text") || "";
  const png = await QRCode.toBuffer(text, { width: 900, margin: 2, color: { dark: "#20150cff", light: "#faf8f4ff" } });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Content-Disposition": 'inline; filename="qrcode-be-story.png"' } });
});
