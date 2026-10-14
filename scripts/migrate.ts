import fs from "node:fs";
import path from "node:path";
import { sql } from "../lib/db";

async function main() {
  const db = sql();
  await db.unsafe(fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8"));
  console.log("✓ Banco atualizado");
  await db.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
