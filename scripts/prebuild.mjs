// Antes do build na Netlify: aplica o esquema do banco (idempotente), se DATABASE_URL existir.
import { execSync } from "node:child_process";
if (process.env.DATABASE_URL) {
  try { execSync("npx tsx scripts/migrate.ts", { stdio: "inherit" }); }
  catch { console.warn("Aviso: não foi possível atualizar o banco agora; o worker tenta de novo."); }
} else {
  console.log("DATABASE_URL ausente: pulando migração.");
}
