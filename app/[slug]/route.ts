import { getEventBySlug, buildStoryData, isExpired, RESERVED_SLUGS, SITE_URL, BE_WHATSAPP } from "@/lib/events";
import { hasEventAccess, isAdmin, visitorId } from "@/lib/auth";
import { page, htmlResponse, storyMarkup, safeJson, esc } from "@/lib/html";
import { fontCss, type CustomFont, type EventFonts } from "@/lib/fonts";
import { sql } from "@/lib/db";
import { signedUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

const dateLong = (d: Date) => d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (RESERVED_SLUGS.has(slug)) return notFound();
  const ev = await getEventBySlug(slug);
  const url = new URL(req.url);
  const admin = url.searchParams.has("preview") && (await isAdmin());
  if (!ev || (ev.status === "rascunho" && !admin)) return notFound();

  const title = `${ev.client_names} · BE STORY Memórias`;
  const og = `${SITE_URL()}/api/og/${slug}?v=${ev.updated_at.getTime()}`;
  const desc = `${ev.title} · ${dateLong(ev.event_date)}. Um lugar para guardar, lembrar e reviver.`;

  if (!admin && isExpired(ev)) {
    return htmlResponse(page({ title, description: desc, ogImage: og, body: simpleCard(
      "Esta história foi guardada",
      `O espaço de memórias de ${esc(ev.client_names)} expirou. Os arquivos originais continuam seguros com a BE Studio. Fale com a gente para reativar.`,
      `<a class="pill pill-cream" href="https://wa.me/${BE_WHATSAPP()}?text=${encodeURIComponent(`Oi, BE! Quero reativar o site de memórias de ${ev.client_names}.`)}">Falar com a BE Studio</a>`,
    ) }), 410);
  }

  if (!admin && ev.password_hash && !(await hasEventAccess(slug))) {
    return htmlResponse(page({ title, description: desc, ogImage: og, url: `${SITE_URL()}/${slug}`, body: gate(slug, ev.client_names) }));
  }

  const data = await buildStoryData(ev, await visitorId(), { preview: admin });
  const body = `${storyMarkup()}
<script id="story-data" type="application/json">${safeJson(data)}</script>
<script src="/story/story.js?v=${process.env.NEXT_PUBLIC_ASSET_VERSION || "1"}" defer></script>`;
  return htmlResponse(page({ title, description: desc, ogImage: og, url: `${SITE_URL()}/${slug}`, body, bodyClass: "lock", theme: ev.theme, head: await eventFontHead(ev) }));
}

/** Fontes escolhidas no painel para este evento (catálogo ou fontes próprias da BE). */
async function eventFontHead(ev: object) {
  const chosen = ((ev as { fonts?: unknown }).fonts ?? {}) as EventFonts;
  const ids = Object.values(chosen).filter((v): v is string => typeof v === "string" && v.startsWith("custom:")).map((v) => v.slice(7));
  let custom: CustomFont[] = [];
  if (ids.length) {
    const rows = await sql()`select id, name, key, format from brand_fonts where id = any(${ids}::uuid[])`;
    custom = await Promise.all(rows.map(async (r) => ({ id: r.id as string, name: r.name as string, format: r.format as string, url: (await signedUrl(r.key, { expires: 86400 })) ?? "" })));
  }
  const css = fontCss(chosen, custom);
  return css ? `<style id="event-fonts">${css.replace(/<\//g, "<\\/")}</style>` : "";
}

function notFound() {
  return htmlResponse(page({ title: "Página não encontrada · BE STORY", body: simpleCard("Não encontramos esta história", "Confira o link que você recebeu da BE Studio.", "") }), 404);
}

function simpleCard(h: string, p: string, actions: string) {
  return `<div style="min-height:100svh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg-open);text-align:center">
  <div style="max-width:380px;display:flex;flex-direction:column;gap:18px;align-items:center">
    <img src="/brand/be-logo-cream.png" alt="BE Studio" style="width:54px;opacity:.9">
    <h1 class="h2" style="font-size:26px">${h}</h1><p class="lead" style="font-size:14px">${p}</p>${actions}
  </div></div>`;
}

function gate(slug: string, names: string) {
  return `<div id="gate" class="show" role="dialog" aria-modal="true" aria-labelledby="gate-l">
  <form id="gate-form" autocomplete="off">
    <img src="/brand/be-logo-cream.png" alt="BE Studio">
    <span class="eyebrow">${esc(names)}</span>
    <label id="gate-l" for="gate-in">Digite a palavra-chave da sua história</label>
    <input id="gate-in" type="password" autocapitalize="none" spellcheck="false" aria-describedby="gate-err" required>
    <div class="err" id="gate-err" aria-live="polite"></div>
    <button class="pill pill-cream" type="submit">Abrir</button>
  </form>
</div>
<script>
(function(){var f=document.getElementById('gate-form'),i=document.getElementById('gate-in'),e=document.getElementById('gate-err');i.focus();
f.addEventListener('submit',function(ev){ev.preventDefault();e.textContent='';
fetch('/api/e/${encodeURIComponent(slug)}/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:i.value}),credentials:'same-origin'})
.then(function(r){ if(r.ok){ document.getElementById('gate').style.transition='opacity .6s'; document.getElementById('gate').style.opacity=0; setTimeout(function(){location.reload()},500);} else return r.json().then(function(j){ throw j; }); })
.catch(function(j){ e.textContent=(j&&j.error)||'Palavra-chave incorreta. Confira a mensagem que enviamos.'; f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); try{navigator.vibrate&&navigator.vibrate(80)}catch(_){}});});})();
</script>`;
}
