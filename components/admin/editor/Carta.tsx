"use client";
import { useState } from "react";
import type { Ctx } from "./types";

export const DEFAULT_LETTER = `Um dia especial merece um lugar para ser lembrado.

Por isso, reunimos aqui cada arquivo desse momento, com o mesmo cuidado que tivemos ao acompanhá-los durante o evento.

Que este espaço seja uma pequena cápsula de memória, daquelas que a gente abre depois de um tempo e, por alguns minutos, consegue voltar exatamente para aquele dia.

Foi muito especial fazer parte dele!`;

export default function Carta({ d, patchEvent }: Ctx) {
  const e = d.event;
  const [letter, setLetter] = useState<string>(e.letter ?? "");
  const [caption, setCaption] = useState<string>(e.share_caption ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <form className="grid max-w-5xl gap-6 lg:grid-cols-2" onSubmit={async (ev) => { ev.preventDefault(); setBusy(true); try { await patchEvent({ letter: letter.trim() || null, share_caption: caption.trim() || null }); } finally { setBusy(false); } }}>
      <div className="card space-y-4 p-6">
        <div>
          <label className="label">Carta da abertura</label>
          <p className="mb-3 text-xs text-white/50">Aparece linha por linha ao lado da Polaroid, depois de “Para guardar, lembrar e reviver. 🤎” e antes da assinatura. Deixe em branco para usar o texto padrão da BE. Separe os parágrafos com uma linha em branco.</p>
          <textarea className="field min-h-72 leading-relaxed" value={letter} onChange={(ev) => setLetter(ev.target.value)} placeholder={DEFAULT_LETTER} />
        </div>
        {!letter && <button type="button" className="text-xs text-sand underline" onClick={() => setLetter(DEFAULT_LETTER)}>Começar a partir do texto padrão</button>}
      </div>
      <div className="space-y-6">
        <div className="card space-y-4 p-6">
          <label className="label">Legenda sugerida para compartilhar</label>
          <textarea className="field min-h-36" value={caption} onChange={(ev) => setCaption(ev.target.value)} placeholder={`Nosso dia, guardado para sempre. 🤎\n${e.client_names} · cada detalhe registrado com carinho pela @bestudioaudiovisual.`} />
          <p className="text-xs text-white/50">O cliente copia essa legenda junto com o clipe 9:16.</p>
        </div>
        <div className="rounded-2xl bg-[#0f0d0b] p-6 text-center">
          <div className="font-serif text-lg italic">Para guardar, lembrar e reviver. 🤎</div>
          <div className="mt-3 space-y-2 text-sm text-white/60">{(letter || DEFAULT_LETTER).split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}</div>
          <div className="mt-4 font-script text-4xl text-sand">Com carinho,</div>
          <div className="text-xs font-medium uppercase tracking-[.28em]">BE Studio</div>
        </div>
        <div className="flex justify-end"><button className="btn-cream" disabled={busy}>Salvar carta</button></div>
      </div>
    </form>
  );
}
