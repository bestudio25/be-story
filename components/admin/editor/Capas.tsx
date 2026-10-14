"use client";
import { useRef, useState } from "react";
import { api } from "../api";
import type { Ctx, FileItem } from "./types";

type Slot = "polaroid_file_id" | "cover_file_id" | "final_file_id";

/** Escolha das imagens-chave: Polaroid da abertura, capa (1ª foto do hero), Polaroid final, fotos que passam no hero, Reels e filme. */
export default function Capas({ d, patchEvent, reload, toast }: Ctx) {
  const photos = d.files.filter((f) => f.kind === "foto" && f.processing === "pronto");
  const videos = d.files.filter((f) => f.kind === "video" && f.processing === "pronto");
  const [pick, setPick] = useState<null | { slot: Slot | "hero" | "reels_file_id" | "film_file_id" }>(null);
  const e = d.event;
  const byId = (id?: string | null) => d.files.find((f) => f.id === id);
  const auto = photos.find((f) => f.is_highlight) ?? photos[0];
  const hero: string[] = e.hero_file_ids ?? [];

  const slots: { k: Slot; t: string; s: string; square?: boolean }[] = [
    { k: "polaroid_file_id", t: "Foto da Polaroid", s: "Revelada na abertura. Fica quadrada.", square: true },
    { k: "cover_file_id", t: "Capa", s: "Fundo do site logo depois da abertura e imagem do link no WhatsApp." },
    { k: "final_file_id", t: "Polaroid final", s: "“Até a próxima história”, no encerramento.", square: true },
  ];
  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-3">
        {slots.map((s) => {
          const f = byId(e[s.k]) ?? (s.k === "final_file_id" ? photos.at(-1) : auto);
          return (
            <div key={s.k} className="card overflow-hidden">
              <button onClick={() => setPick({ slot: s.k })} className={`group relative block w-full bg-panel-2 ${s.square ? "aspect-square" : "aspect-[4/3]"}`}>
                {f?.poster && <img src={f.poster} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm opacity-0 transition group-hover:opacity-100">Trocar foto</span>
                {!e[s.k] && f && <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px]">automática</span>}
              </button>
              <div className="p-4"><div className="font-medium">{s.t}</div><div className="text-xs text-white/50">{s.s}</div></div>
            </div>
          );
        })}
      </div>

      <div className="card space-y-4 p-5">
        <div className="flex items-end justify-between gap-3">
          <div><div className="font-medium">Fotos que passam no fundo do site</div><div className="text-xs text-white/50">Trocam a cada 5 segundos, com zoom lento. Sem escolha, usamos os destaques.</div></div>
          <button className="btn-ghost" onClick={() => setPick({ slot: "hero" })}>Escolher fotos</button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(hero.length ? hero.map((id) => byId(id)) : photos.filter((f) => f.is_highlight).slice(0, 9)).filter(Boolean).map((f) => (
            <img key={f!.id} src={f!.thumb} alt="" className="h-28 w-auto rounded-lg object-cover" />
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {([["reels_file_id", "Clipe pronto (Reels 9:16)", "Por padrão é o arquivo Reels_… da raiz da pasta do Drive."], ["film_file_id", "Filme (“Assistir ao filme”)", "Opcional. Sem escolha, o botão toca o Reels."]] as const).map(([k, t, s]) => {
          const f = byId(e[k]);
          const shown = f ?? (k === "film_file_id" ? byId(e.reels_file_id) : undefined);
          return (
            <div key={k} className="card flex gap-4 p-4">
              <div className="h-32 w-20 shrink-0 overflow-hidden rounded-lg bg-panel-2">{shown?.thumb && <img src={shown.thumb} alt="" className="h-full w-full object-cover" />}</div>
              <div className="flex-1 space-y-2"><div className="font-medium">{t}</div><div className="text-xs text-white/50">{s}</div>
                <div className="text-xs">{f ? f.original_name : k === "film_file_id" && e.reels_file_id ? <span className="text-white/60">Usando o Reels</span> : <span className="text-amber-300">Nenhum vídeo escolhido</span>}</div>
                <div className="flex gap-2"><button className="chip" onClick={() => setPick({ slot: k })}>Escolher vídeo</button>{f && k === "film_file_id" && <button className="chip" onClick={() => patchEvent({ film_file_id: null })}>Usar o Reels</button>}</div>
              </div>
            </div>
          );
        })}
      </div>

      <Trilha d={d} reload={reload} toast={toast} />

      {pick && (
        <Picker
          title={pick.slot === "hero" ? "Fotos do fundo (na ordem em que clicar)" : pick.slot.includes("reels") || pick.slot.includes("film") ? "Escolha o vídeo" : "Escolha a foto"}
          items={pick.slot === "reels_file_id" || pick.slot === "film_file_id" ? videos : photos}
          multi={pick.slot === "hero"}
          initial={pick.slot === "hero" ? hero : [e[pick.slot]].filter(Boolean)}
          onClose={() => setPick(null)}
          onSave={async (ids) => { await patchEvent(pick.slot === "hero" ? { hero_file_ids: ids } : { [pick.slot]: ids[0] ?? null }); setPick(null); }}
        />
      )}
    </div>
  );
}

function Picker({ title, items, multi, initial, onClose, onSave }: { title: string; items: FileItem[]; multi: boolean; initial: string[]; onClose: () => void; onSave: (ids: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(initial);
  const [only, setOnly] = useState(true);
  const list = only && items.some((f) => f.is_highlight) ? items.filter((f) => f.is_highlight || sel.includes(f.id)) : items;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur sm:items-center" onClick={onClose}>
      <div className="card flex max-h-[85vh] w-full max-w-4xl flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
          <div className="font-serif text-lg italic">{title}</div>
          <label className="flex items-center gap-2 text-xs text-white/60"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> só destaques</label>
        </div>
        <div className="grid flex-1 grid-cols-3 gap-2 overflow-auto p-4 sm:grid-cols-5 md:grid-cols-6">
          {list.map((f) => {
            const i = sel.indexOf(f.id);
            return (
              <button key={f.id} onClick={() => setSel(multi ? (i >= 0 ? sel.filter((x) => x !== f.id) : [...sel, f.id]) : [f.id])}
                className={`relative aspect-[4/5] overflow-hidden rounded-lg ring-2 ${i >= 0 ? "ring-sand" : "ring-transparent"}`}>
                <img src={f.thumb} alt="" className="h-full w-full object-cover" />
                {multi && i >= 0 && <span className="absolute left-1 top-1 rounded-full bg-sand px-1.5 text-[11px] font-semibold text-[#20150c]">{i + 1}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 border-t border-white/10 p-4">
          {multi && <button className="btn-ghost mr-auto" onClick={() => setSel([])}>Usar os destaques</button>}
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-cream" onClick={() => onSave(sel)}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

function Trilha({ d, reload, toast }: Pick<Ctx, "d" | "reload" | "toast">) {
  const e = d.event;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string>("");
  const send = async (file: File) => {
    try {
      const type = file.type || (/\.m4a$/i.test(file.name) ? "audio/mp4" : "audio/mpeg");
      setBusy("Preparando…");
      const { key, url } = await api<{ key: string; url: string }>(`/api/admin/events/${e.id}/soundtrack`, { body: { contentType: type, size: file.size } });
      await new Promise<void>((ok, fail) => {
        const x = new XMLHttpRequest();
        x.open("PUT", url); x.setRequestHeader("Content-Type", type);
        x.upload.onprogress = (p) => p.lengthComputable && setBusy(`Enviando… ${Math.round((p.loaded / p.total) * 100)}%`);
        x.onload = () => (x.status < 300 ? ok() : fail(new Error("Falha no envio (" + x.status + ")")));
        x.onerror = () => fail(new Error("Falha no envio. Verifique a internet."));
        x.send(file);
      });
      await api(`/api/admin/events/${e.id}/soundtrack`, { method: "PUT", body: { key, name: file.name } });
      await reload(); toast("Música salva");
    } catch (err) { toast((err as Error).message); } finally { setBusy(""); if (input.current) input.current.value = ""; }
  };
  return (
    <div className="card space-y-3 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-medium">Trilha sonora</div>
          <div className="text-xs text-white/50">Toca de fundo quando o cliente abre a história (ele pode pausar no ícone de som). Pausa sozinha quando um vídeo toca. MP3 ou M4A, até 40 MB.</div>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={!!busy} onClick={() => input.current?.click()}>{busy || (e.soundtrack_key ? "Trocar música" : "Enviar música")}</button>
          {e.soundtrack_key && !busy && <button className="chip" onClick={async () => { await api(`/api/admin/events/${e.id}/soundtrack`, { method: "DELETE" }); await reload(); toast("Música removida"); }}>Remover</button>}
        </div>
      </div>
      <input ref={input} type="file" accept="audio/*,.mp3,.m4a" hidden onChange={(ev) => { const f = ev.target.files?.[0]; if (f) send(f); }} />
      {e.soundtrack_url ? (
        <div className="space-y-1">
          <div className="text-xs text-white/60">{e.soundtrack_name || "Música enviada"}</div>
          <audio controls preload="none" src={e.soundtrack_url} className="w-full" />
        </div>
      ) : <div className="text-xs text-white/40">Nenhuma música. Sem trilha, o ícone de som só toca o clique da câmera na abertura.</div>}
    </div>
  );
}
