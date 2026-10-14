import { page, htmlResponse } from "@/lib/html";
import { BE_INSTAGRAM, BE_WHATSAPP } from "@/lib/events";

export function GET() {
  return htmlResponse(page({
    title: "BE STORY · Memórias",
    body: `<div style="min-height:100svh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg-open);text-align:center">
  <div style="max-width:420px;display:flex;flex-direction:column;gap:18px;align-items:center">
    <img src="/brand/be-logo-cream.png" alt="BE Studio" style="width:64px">
    <span class="eyebrow">BE Story · Memórias</span>
    <h1 class="h2">Um lugar para guardar, lembrar e reviver.</h1>
    <p class="lead" style="font-size:14px">Cada cliente da BE Studio Audiovisual recebe um link exclusivo com todas as memórias do seu evento.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
      <a class="pill pill-cream" href="/demo">Ver demonstração</a>
      <a class="pill pill-ghost" href="https://wa.me/${BE_WHATSAPP()}">Falar com a BE</a>
    </div>
    <a href="https://instagram.com/${BE_INSTAGRAM()}" style="font-size:12px;color:var(--faint);text-decoration:none">@${BE_INSTAGRAM()}</a>
  </div></div>`,
  }));
}
