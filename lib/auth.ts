import { appSecret } from "./secret";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { sql, hasDb } from "./db";

const secret = () => new TextEncoder().encode(appSecret());

export const ADMIN_COOKIE = "be_admin";
export const eventCookie = (slug: string) => `be_ev_${slug.replace(/[^a-z0-9-]/g, "")}`;
export const VISITOR_COOKIE = "be_visitor";

export async function sign(payload: Record<string, unknown>, ttl: string) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(ttl).sign(secret());
}
export async function verify<T = Record<string, unknown>>(token?: string) {
  if (!token) return null;
  try {
    return (await jwtVerify(token, secret())).payload as T;
  } catch {
    return null;
  }
}

let DUMMY = "";

// ── Admin ─────────────────────────────────────────────────────────
export async function adminCount() {
  if (!hasDb()) return 0;
  const [r] = await sql()`select count(*)::int as n from admins`;
  return r.n as number;
}
export async function checkAdminLogin(email: string, password: string) {
  const [a] = await sql()`select id, email, name, password_hash from admins where lower(email) = ${email.trim().toLowerCase()}`;
  if (!a) {
    await bcrypt.compare(password, (DUMMY ||= bcrypt.hashSync("dummy", 10))); // tempo constante
    return null;
  }
  return (await bcrypt.compare(password, a.password_hash)) ? { id: a.id as string, email: a.email as string, name: a.name as string } : null;
}
export async function getAdmin() {
  const jar = await cookies();
  return verify<{ sub: string; email: string; role: string }>(jar.get(ADMIN_COOKIE)?.value).then((s) => (s?.role === "admin" ? s : null));
}
export async function isAdmin() {
  return !!(await getAdmin());
}
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function requireAdmin() {
  const a = await getAdmin();
  if (!a) throw new HttpError(401, "Não autorizado");
  return a;
}

// ── Cliente ───────────────────────────────────────────────────────
export async function hasEventAccess(slug: string) {
  const jar = await cookies();
  const s = await verify<{ slug: string }>(jar.get(eventCookie(slug))?.value);
  return s?.slug === slug;
}
export const hashPassword = (p: string, rounds = 10) => bcrypt.hash(p, rounds);
export const normalizeKeyword = (p: string) => p.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export const hashKeyword = (p: string) => bcrypt.hash(normalizeKeyword(p), 10);
export const checkKeyword = (p: string, hash: string) => bcrypt.compare(normalizeKeyword(p), hash);

export async function visitorId() {
  const jar = await cookies();
  return jar.get(VISITOR_COOKIE)?.value ?? null;
}
