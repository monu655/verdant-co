import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { ZodError } from "zod";
import type { Env } from "./config/env.js";
import type { Db } from "./db/pool.js";
import { HttpError } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { requireAgent, sameOriginOnly } from "./middleware/auth.js";
import { agentRouter } from "./routes/agent.js";
import { authRouter } from "./routes/auth.js";
import { customerRouter } from "./routes/customer.js";
import { webhookRouter } from "./routes/webhook.js";
import type { LlmClient } from "./services/llm.js";

export function createApp(deps: { db: Db; env: Env; llm: LlmClient }) {
  const { db, env, llm } = deps;
  const origins = env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet());

  app.get("/health", async (_req, res) => {
    try { await db.query("SELECT 1"); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
  });

  // Webhook is mounted BEFORE body parsers so it receives the untouched raw bytes.
  app.use(webhookRouter(db, llm, env));

  app.use(cors({ origin: origins, credentials: true }));
  app.use(express.json({ limit: "50kb" }));
  app.use(cookieParser());

  app.use("/api/customer", customerRouter(db, llm, env));
  app.use("/api/auth", sameOriginOnly(origins), authRouter(db, env));
  app.use("/api", sameOriginOnly(origins), requireAgent(db, env), agentRouter(db, llm, env));

  app.use((_req, res) => res.status(404).json({ error: "not_found", message: "Not found" }));

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (err instanceof ZodError) return res.status(400).json({ error: "validation", message: err.issues[0]?.message ?? "Invalid request" });
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "validation", message: "Invalid JSON" });
    logger.error("unhandled_error", { error: err instanceof Error ? err.stack : String(err) });
    res.status(500).json({ error: "internal", message: "Something went wrong. Please try again." });
  };
  app.use(onError);
  return app;
}
