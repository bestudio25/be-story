import { getEventBySlug, isExpired } from "./events";
import { hasEventAccess, isAdmin, HttpError, visitorId } from "./auth";

/** Evento acessível pelo cliente nesta requisição (ou erro 404/401). */
export async function accessibleEvent(slug: string) {
  const ev = await getEventBySlug(slug);
  if (!ev) throw new HttpError(404, "Evento não encontrado");
  const admin = await isAdmin();
  if (!admin) {
    if (ev.status === "rascunho") throw new HttpError(404, "Evento não encontrado");
    if (isExpired(ev)) throw new HttpError(410, "Este evento expirou");
    if (ev.password_hash && !(await hasEventAccess(slug))) throw new HttpError(401, "Digite a palavra-chave");
  }
  return { ev, visitor: await visitorId(), admin };
}
