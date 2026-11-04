import supertest from "supertest";
import { createApp } from "../src/app.js";
import { createPool } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";
import { upsertAgent } from "../src/db/seed.js";
import { sign } from "../src/lib/signature.js";
import { LlmError, type DraftRequest, type LlmClient } from "../src/services/llm.js";
import { loadEnv } from "../src/config/env.js";

export const SECRET = "verdant-demo-secret-2026";
export const AGENT = { email: "agent@test.local", password: "correct-horse-battery" };

export const env = loadEnv({
  NODE_ENV: "test",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://verdant:verdant@localhost:5432/verdant_test",
  JWT_SECRET: "test-secret-test-secret-test",
  WEBHOOK_SECRET: SECRET,
  CORS_ORIGIN: "http://localhost:5173",
} as NodeJS.ProcessEnv);

export class FakeLlm implements LlmClient {
  mode: "ok" | "fail" = "ok";
  calls: DraftRequest[] = [];
  async draftReply(req: DraftRequest) {
    this.calls.push(req);
    if (this.mode === "fail") throw new LlmError("The AI provider returned an error (HTTP 503)");
    const last = req.history[req.history.length - 1]!.body;
    const unknown = /dubai|allerg/i.test(last);
    return { reply: unknown ? "I'm not able to confirm that. A team member will follow up." : `Draft for: ${last}`, needsHuman: unknown, model: "fake" };
  }
}

export async function setup() {
  const db = createPool(env);
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
  await upsertAgent(db, AGENT.email, AGENT.password, "Test Agent");
  const llm = new FakeLlm();
  const app = createApp({ db, env, llm });
  return { db, llm, app, request: supertest(app) };
}

export function webhookBody(over: Record<string, unknown> = {}) {
  return {
    event_id: "evt_7f3a91c2", type: "message.received", brand_id: "verdant-co", timestamp: "2026-11-03T10:15:22Z",
    customer: { id: "cust_1042", name: "Aisha Khan", phone: "+919800000001" },
    message: { id: "msg_88213", type: "text", text: "Hi, my order #4471 hasn't arrived yet. Can I change the delivery address?" },
    ...over,
  };
}

export function postWebhook(request: supertest.Agent, body: unknown, opts: { signature?: string; secret?: string } = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return request.post("/webhook").set("Content-Type", "application/json")
    .set("X-Signature", opts.signature ?? sign(raw, opts.secret ?? SECRET)).send(raw);
}

/** Wait until the background draft job has produced a draft row for the message. */
export async function waitForDraft(db: ReturnType<typeof createPool>, count = 1) {
  for (let i = 0; i < 100; i++) {
    const n = (await db.query("SELECT count(*)::int AS n FROM ai_drafts")).rows[0].n;
    if (n >= count) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("draft was not created in time");
}

export async function login(request: supertest.Agent) {
  const res = await request.post("/api/auth/login").send(AGENT);
  const cookie = res.headers["set-cookie"] as unknown as string[];
  return { res, cookie };
}
