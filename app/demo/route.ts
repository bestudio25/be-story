import fs from "node:fs/promises";
import path from "node:path";
import { htmlResponse } from "@/lib/html";

/** Página de demonstração comercial (evento fictício, dados embutidos). */
export async function GET() {
  return htmlResponse(await fs.readFile(path.join(process.cwd(), "story", "demo.html"), "utf8"));
}
