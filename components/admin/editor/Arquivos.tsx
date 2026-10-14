"use client";
import { useMemo, useRef, useState } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api, fmtBytes, fmtDur } from "../api";
import type { Ctx, Chapter, FileItem } from "./types";
import Uploader from "./Uploader";

const ALL = "__all__", NONE = "__none__";

export default function Arquivos(ctx: Ctx & { onError: (m: string) => void }) {
  const { d, reload, toast, onError } = ctx;
  const [sel, setSel] = useState<string>(ALL);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [drive, setDrive] = useState<string>(d.event.drive_folder_id ? `https://drive.google.com/drive/folders/${d.event.drive_folder_id}` : "");
  const [filter, setFilter] = useState<"" | "video" | "foto" | "hl" | "erro">("");
  const lastClick = useRef<string | null>(null);

  const chapters = useMemo(() => [...d.chapters].sort((a, b) => a.position - b.position), [d.chapters]);
  const kids = (pid: string | null) => chapters.filter((c) => c.parent_id === pid);
  const files = useMemo(() => {
    let l = d.files.filter((f) => !f.is_reels);
    if (sel === NONE) l = l.filter((f) => !f.chapter_id);
    else if (sel !== ALL) l = l.filter((f) => f.chapter_id === sel);
    if (filter === "video" || filter === "foto") l = l.filter((f) => f.kind === filter);
    if (filter === "hl") l = l.filter((f) => f.is_highlight);
    if (filter === "erro") l = l.filter((f) => f.processing === "erro");
    return l.sort((a, b) => a.position - b.position);
  }, [d.files, sel, filter]);
  const reels = d.files.find((f) => f.is_reels);
  const count = (id: string) => d.files.filter((f) => f.chapter_id === id && !f.is_reels).length;

  const sync = async () => {
    setSyncing(true); onError("");
    try {
      if (drive && !drive.includes(d.event.drive_folder_id ?? "∅")) await api(`/api/admin/events/${d.event.id}`, { method: "PATCH", body: { drive_folder_id: drive } });
      const r = await api<{ newFiles: number; totalFiles: number; chapters: number; worker: boolean }>(`/api/admin/events/${d.event.id}/sync`, { body: {} });
      toast(r.newFiles ? `${r.newFiles} arquivos novos na fila de processamento` : "Tudo sincronizado, nenhum arquivo novo");
      await reload();
    } catch (e) { onError((e as Error).message); } finally { setSyncing(false); }
  };

  const click = (id: string, e: React.MouseEvent) => {
    const next = new Set(picked);
    if (e.shiftKey && lastClick.current) {
      const ids = files.map((f) => f.id); const a = ids.indexOf(lastClick.current), b = ids.indexOf(id);
      ids.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => next.add(x));
    } else if (e.metaKey || e.ctrlKey) { next.has(id) ? next.delete(id) : next.add(id); }
    else { next.clear(); next.add(id); }
    lastClick.current = id; setPicked(next); setFocus(next.size === 1 ? id : null);
  };

  const bulk = async (body: Record<string, unknown>, msg: string) => {
    await api("/api/admin/files", { method: "PATCH", body: { ids: [...picked], ...body } }); toast(msg); await reload();
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = files.map((f) => f.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    await api("/api/admin/files/reorder", { body: { ids: next } }); await reload();
  };

  const focused = focus ? d.files.find((f) => f.id === focus) : null;

  return (
    <div className="space-y-6">
      {/* Origem dos arquivos */}
      <div className="card flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-64 flex-1">
          <label className="label">Pasta do Drive</label>
          <input className="field" placeholder="https://drive.google.com/drive/folders/…" value={drive} onChange={(e) => setDrive(e.target.value)} />
        </div>
        <button className="btn-cream" onClick={sync} disabled={syncing || !drive}>{syncing ? "Lendo a pasta…" : d.files.length ? "Sincronizar" : "Gerar site"}</button>
        <div className="w-full text-xs text-white/50">
          {d.event.drive_synced_at ? `Última sincronização: ${new Date(d.event.drive_synced_at).toLocaleString("pt-BR")}. ` : ""}
          Subpastas viram capítulos. Arquivos novos na pasta entram ao clicar em Sincronizar.
          {reels ? <> · <b className="text-sand">Reels encontrado</b>: {reels.original_name} ({reels.processing === "pronto" ? "pronto" : "processando"})</> : <> · Nenhum arquivo <b>Reels_…</b> na raiz da pasta.</>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Capítulos */}
        <aside className="space-y-3">
          <div className="card p-2 text-sm">
            <Row active={sel === ALL} onClick={() => setSel(ALL)} label="Todos os arquivos" n={d.files.filter((f) => !f.is_reels).length} />
            {kids(null).map((c, i, arr) => <ChapterNode key={c.id} c={c} depth={0} sel={sel} setSel={setSel} kids={kids} count={count} ctx={ctx} siblings={arr} idx={i} />)}
            {d.files.some((f) => !f.chapter_id && !f.is_reels) && <Row active={sel === NONE} onClick={() => setSel(NONE)} label="Sem capítulo" n={d.files.filter((f) => !f.chapter_id && !f.is_reels).length} muted />}
          </div>
          <button className="btn-ghost w-full" onClick={async () => { const name = prompt("Nome do novo capítulo"); if (name) { await api("/api/admin/chapters", { body: { eventId: d.event.id, name, parentId: null } }); await reload(); } }}>+ Capítulo</button>
          <p className="px-1 text-xs text-white/40">Use ↑↓ para ordenar a linha do tempo. O olho esconde um capítulo do cliente (fica só no painel).</p>
        </aside>

        {/* Grade */}
        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {([["", "Tudo"], ["foto", "Fotos"], ["video", "Vídeos"], ["hl", "Destaques"], ["erro", "Com erro"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`chip ${filter === k ? "border-cream bg-cream text-[#20150c]" : ""}`}>{l}</button>
            ))}
            <span className="ml-auto text-xs text-white/50">{files.length} arquivos · clique para selecionar, Shift para vários, arraste para reordenar</span>
          </div>

          {picked.size > 0 && (
            <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-sand/30 bg-[#1d1a17]/95 p-3 text-sm backdrop-blur">
              <b className="px-2">{picked.size} selecionado{picked.size > 1 ? "s" : ""}</b>
              <button className="chip" onClick={() => bulk({ highlight: true }, "Marcado como destaque")}>★ Destaque</button>
              <button className="chip" onClick={() => bulk({ highlight: false }, "Destaque removido")}>☆ Tirar destaque</button>
              <select className="chip bg-transparent" value="" onChange={(e) => e.target.value && bulk({ chapterId: e.target.value === NONE ? null : e.target.value }, "Arquivos movidos")}>
                <option value="">Mover para…</option>
                {chapters.map((c) => <option key={c.id} value={c.id}>{c.parent_id ? "  └ " : ""}{c.name}</option>)}
                <option value={NONE}>Sem capítulo</option>
              </select>
              <button className="chip" onClick={() => { const n = prompt("Novo nome (use {n} para numerar, ex.: Votos {n})"); if (n) bulk({ name: n }, "Renomeados"); }}>Renomear</button>
              <button className="chip" onClick={() => { const t = prompt("Tags separadas por vírgula (ex.: votos, entrada)"); if (t) bulk({ addTags: t.split(",") }, "Tags adicionadas"); }}>+ Tags</button>
              <button className="ml-auto text-xs text-white/50 hover:text-cream" onClick={() => { setPicked(new Set()); setFocus(null); }}>Limpar seleção</button>
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={files.map((f) => f.id)} strategy={rectSortingStrategy}>
                <div className="grid content-start grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                  {files.map((f) => <Tile key={f.id} f={f} on={picked.has(f.id)} onClick={(e) => click(f.id, e)} />)}
                </div>
              </SortableContext>
            </DndContext>
            {focused ? <FilePanel f={focused} ctx={ctx} /> : (
              <div className="hidden xl:block">
                <Uploader eventId={d.event.id} chapterId={sel !== ALL && sel !== NONE ? sel : null} chapterName={sel !== ALL && sel !== NONE ? chapters.find((c) => c.id === sel)?.name : undefined} onDone={reload} />
                <button className="btn-ghost mt-3 w-full" onClick={async () => { await api("/api/admin/files/reorder", { body: { eventId: d.event.id, byTime: true } }); await reload(); toast("Ordenado pelo horário de gravação"); }}>Ordenar tudo pelo horário de gravação</button>
              </div>
            )}
          </div>
          <div className="xl:hidden"><Uploader eventId={d.event.id} chapterId={sel !== ALL && sel !== NONE ? sel : null} onDone={reload} /></div>
        </section>
      </div>
    </div>
  );
}

function Row({ active, onClick, label, n, muted }: { active: boolean; onClick: () => void; label: string; n: number; muted?: boolean }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition ${active ? "bg-white/10 text-cream" : muted ? "text-white/40 hover:bg-white/5" : "text-white/70 hover:bg-white/5"}`}>
      <span className="truncate">{label}</span><span className="text-xs text-white/40">{n}</span>
    </button>
  );
}

function ChapterNode({ c, depth, sel, setSel, kids, count, ctx, siblings, idx }: {
  c: Chapter; depth: number; sel: string; setSel: (s: string) => void; kids: (p: string | null) => Chapter[]; count: (id: string) => number; ctx: Ctx; siblings: Chapter[]; idx: number;
}) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(c.name);
  const save = async (b: Record<string, unknown>) => { await api("/api/admin/chapters", { method: "PATCH", body: { id: c.id, ...b } }); await ctx.reload(); };
  const move = async (dir: -1 | 1) => {
    const ids = siblings.map((s) => s.id); const j = idx + dir; if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    await api("/api/admin/chapters/reorder", { body: { ids } }); await ctx.reload();
  };
  return (
    <div>
      <div className={`group flex items-center gap-1 rounded-lg pr-1 ${sel === c.id ? "bg-white/10" : "hover:bg-white/5"}`} style={{ paddingLeft: depth * 14 }}>
        {edit ? (
          <form className="flex-1 p-1" onSubmit={async (e) => { e.preventDefault(); await save({ name }); setEdit(false); }}>
            <input autoFocus className="field py-1 text-sm" value={name} onChange={(e) => setName(e.target.value)} onBlur={async () => { if (name !== c.name) await save({ name }); setEdit(false); }} />
          </form>
        ) : (
          <button onClick={() => setSel(c.id)} onDoubleClick={() => setEdit(true)} className={`flex flex-1 items-center justify-between truncate px-3 py-2 text-left ${c.is_internal ? "text-white/35 line-through" : "text-white/80"}`}>
            <span className="truncate">{depth ? "└ " : ""}{c.name}</span><span className="ml-2 text-xs text-white/40">{count(c.id)}</span>
          </button>
        )}
        <div className="hidden shrink-0 items-center gap-0.5 text-xs text-white/50 group-hover:flex">
          <button title="Subir" onClick={() => move(-1)} className="px-1 hover:text-cream">↑</button>
          <button title="Descer" onClick={() => move(1)} className="px-1 hover:text-cream">↓</button>
          <button title="Renomear" onClick={() => setEdit(true)} className="px-1 hover:text-cream">✎</button>
          <button title={c.is_internal ? "Mostrar ao cliente" : "Esconder do cliente"} onClick={() => save({ is_internal: !c.is_internal })} className="px-1 hover:text-cream">{c.is_internal ? "◌" : "◉"}</button>
          <button title="Subcapítulo" onClick={async () => { const n = prompt("Nome do subcapítulo"); if (n) { await api("/api/admin/chapters", { body: { eventId: ctx.d.event.id, parentId: c.id, name: n } }); await ctx.reload(); } }} className="px-1 hover:text-cream">+</button>
          <button title="Excluir capítulo (os arquivos sobem um nível)" onClick={async () => { if (confirm(`Excluir o capítulo "${c.name}"? Os arquivos não são apagados.`)) { await api(`/api/admin/chapters?id=${c.id}`, { method: "DELETE" }); await ctx.reload(); } }} className="px-1 hover:text-red-300">×</button>
        </div>
      </div>
      {sel === c.id && (
        <input className="field my-1 py-1 text-xs" style={{ marginLeft: depth * 14 + 8, width: `calc(100% - ${depth * 14 + 8}px)` }} placeholder="Descrição curta (aparece no card do capítulo)"
          defaultValue={c.description ?? ""} onBlur={(e) => e.target.value !== (c.description ?? "") && save({ description: e.target.value })} />
      )}
      {kids(c.id).map((k, i, arr) => <ChapterNode key={k.id} c={k} depth={depth + 1} sel={sel} setSel={setSel} kids={kids} count={count} ctx={ctx} siblings={arr} idx={i} />)}
    </div>
  );
}

function Tile({ f, on, onClick }: { f: FileItem; on: boolean; onClick: (e: React.MouseEvent) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: f.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }} {...attributes} {...listeners}
      onClick={onClick} className={`relative aspect-[4/5] cursor-pointer overflow-hidden rounded-lg bg-panel-2 ring-2 transition ${on ? "ring-sand" : "ring-transparent hover:ring-white/20"} ${isDragging ? "opacity-70" : ""}`}>
      {f.thumb ? <img src={f.thumb} alt="" className="h-full w-full object-cover" draggable={false} /> : (
        <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-[11px] text-white/50">
          <span>{f.processing === "erro" ? "⚠️ erro" : "⏳ processando"}</span><span className="line-clamp-2 break-all">{f.original_name}</span>
        </div>
      )}
      {f.kind === "video" && <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px]">▶ {fmtDur(f.duration_sec) || "vídeo"}</span>}
      {f.is_highlight && <span className="absolute left-1.5 top-1.5 rounded-full bg-sand px-1.5 text-[10px] font-semibold text-[#20150c]">★</span>}
      {f.processing === "erro" && f.thumb && <span className="absolute right-1.5 top-1.5 rounded-full bg-red-500/80 px-1.5 text-[10px]">erro</span>}
      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 px-1.5 pb-1 pt-4 text-[10px] text-white/85">{f.display_name}</span>
    </div>
  );
}

function FilePanel({ f, ctx }: { f: FileItem; ctx: Ctx }) {
  const [name, setName] = useState(f.display_name);
  const [tags, setTags] = useState(f.tags.join(", "));
  const vref = useRef<HTMLVideoElement>(null);
  const save = async (b: Record<string, unknown>, m = "Salvo") => { await api("/api/admin/files", { method: "PATCH", body: { ids: [f.id], ...b } }); ctx.toast(m); await ctx.reload(); };
  return (
    <aside className="card h-fit space-y-4 p-4 xl:sticky xl:top-36" key={f.id}>
      {f.kind === "video" && f.lite ? <video ref={vref} src={f.lite} poster={f.poster} controls playsInline className="w-full rounded-lg bg-black" /> :
        f.poster ? <img src={f.poster} alt="" className="w-full rounded-lg" /> : null}
      <div className="text-xs text-white/50 break-all">{f.original_name} · {fmtBytes(f.size_bytes)}{f.recorded_at_known && f.recorded_at ? ` · gravado ${new Date(f.recorded_at).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })}` : ""}</div>
      {f.processing_error && <div className="rounded-lg bg-red-500/10 p-2 text-xs text-red-200">{f.processing_error}</div>}
      <div><label className="label">Nome do momento</label>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== f.display_name && save({ name })} /></div>
      <div><label className="label">Tags</label>
        <input className="field" value={tags} placeholder="votos, entrada, primeira dança" onChange={(e) => setTags(e.target.value)} onBlur={() => save({ tags: tags.split(",") })} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.is_highlight} onChange={(e) => save({ highlight: e.target.checked })} className="accent-[#c9a77c]" /> Destaque (aparece em “Os momentos que a gente não esquece”)</label>
      {f.kind === "video" && f.lite && (
        <button className="btn-ghost w-full" onClick={async () => { const t = vref.current?.currentTime ?? 1; await api(`/api/admin/files/${f.id}/reprocess`, { body: { posterTime: t } }); ctx.toast(`Novo poster em ${t.toFixed(1)}s (leva alguns minutos)`); }}>
          Usar o quadro atual como capa do vídeo
        </button>
      )}
      <button className="w-full text-xs text-white/50 hover:text-cream" onClick={async () => { await api(`/api/admin/files/${f.id}/reprocess`, { body: {} }); ctx.toast("Reprocessando"); await ctx.reload(); }}>Reprocessar arquivo</button>
    </aside>
  );
}
