import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../config/env.js";
import { createPool, type Db } from "./pool.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
// When compiled, SQL files are not copied by tsc; fall back to the source directory.
const sqlDir = fs.existsSync(dir) ? dir : path.resolve(process.cwd(), "src/db/migrations");

export async function migrate(db: Db): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const applied = new Set((await db.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name as string));
  const ran: string[] = [];
  for (const file of fs.readdirSync(sqlDir).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(fs.readFileSync(path.join(sqlDir, file), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      ran.push(file);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  return ran;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const db = createPool(loadEnv());
  migrate(db)
    .then((ran) => console.log(ran.length ? `Applied: ${ran.join(", ")}` : "Database is up to date"))
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => db.end());
}
