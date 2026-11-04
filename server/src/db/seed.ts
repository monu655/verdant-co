import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { loadEnv } from "../config/env.js";
import { createPool, type Db } from "./pool.js";

export async function upsertAgent(db: Db, email: string, password: string, name: string) {
  const hash = await bcrypt.hash(password, 12);
  await db.query(
    `INSERT INTO agents (email, name, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (lower(email)) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name`,
    [email, name, hash],
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const env = loadEnv();
  if (!env.SEED_AGENT_EMAIL || !env.SEED_AGENT_PASSWORD) {
    console.error("Set SEED_AGENT_EMAIL and SEED_AGENT_PASSWORD (min 8 chars) to seed an agent.");
    process.exit(1);
  }
  const db = createPool(env);
  upsertAgent(db, env.SEED_AGENT_EMAIL, env.SEED_AGENT_PASSWORD, env.SEED_AGENT_NAME)
    .then(() => console.log(`Agent ${env.SEED_AGENT_EMAIL} is ready`))
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => db.end());
}
