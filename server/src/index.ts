import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createPool } from "./db/pool.js";
import { migrate } from "./db/migrate.js";
import { upsertAgent } from "./db/seed.js";
import { logger } from "./lib/logger.js";
import { OpenRouterClient } from "./services/llm.js";

const env = loadEnv();
const db = createPool(env);

async function main() {
  const ran = await migrate(db); // idempotent; keeps one-click deploys simple
  if (ran.length) logger.info("migrations_applied", { ran });
  if (env.SEED_AGENT_EMAIL && env.SEED_AGENT_PASSWORD) await upsertAgent(db, env.SEED_AGENT_EMAIL, env.SEED_AGENT_PASSWORD, env.SEED_AGENT_NAME);
  if (!env.LLM_API_KEY) logger.warn("llm_not_configured", { note: "Drafts will fail with a clear error until LLM_API_KEY is set" });
  const app = createApp({ db, env, llm: new OpenRouterClient(env) });
  app.listen(env.PORT, () => logger.info("server_started", { port: env.PORT }));
}
main().catch((e) => { logger.error("startup_failed", { error: e instanceof Error ? e.message : String(e) }); process.exit(1); });
