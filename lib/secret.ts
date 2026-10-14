import { createHash } from "node:crypto";

/** Segredo da aplicação: SESSION_SECRET, ou derivado do DATABASE_URL (que já é secreto) para simplificar a configuração. */
export function appSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.DATABASE_URL) return createHash("sha256").update("be-story|" + process.env.DATABASE_URL).digest("base64url");
  return "dev-only-secret-troque-em-producao-0000";
}
