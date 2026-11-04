import { Router } from "express";
import { z } from "zod";
import { tx, type Db } from "../db/pool.js";
import type { Env } from "../config/env.js";
import { HttpError } from "../lib/errors.js";
import type { LlmClient } from "../services/llm.js";
import { generateDraft } from "../services/drafts.js";
import { KNOWLEDGE_BASE } from "../services/knowledge.js";
import { MAX_MESSAGE_LENGTH } from "../services/messages.js";

const uuid = z.string().uuid();
const textSchema = z.object({ text: z.string().trim().min(1, "Reply cannot be empty").max(MAX_MESSAGE_LENGTH, `Reply is too long (max ${MAX_MESSAGE_LENGTH} characters)`) });

const LIST_SQL = `
SELECT v.id, v.status, v.last_message_at,
       c.name AS customer_name, c.phone AS customer_phone,
       lm.body AS last_body, lm.sender AS last_sender,
       (SELECT count(*)::int FROM messages m WHERE m.conversation_id = v.id AND m.sender = 'customer'
          AND (v.agent_last_read_at IS NULL OR m.created_at > v.agent_last_read_at)) AS unread,
       (lm.sender = 'customer') AS needs_reply,
       EXISTS (SELECT 1 FROM ai_drafts d WHERE d.conversation_id = v.id AND d.status = 'pending') AS has_draft
  FROM conversations v
  JOIN customers c ON c.id = v.customer_id
  JOIN LATERAL (SELECT body, sender FROM messages WHERE conversation_id = v.id ORDER BY created_at DESC, id DESC LIMIT 1) lm ON true
`;

export function agentRouter(db: Db, llm: LlmClient, env: Pick<Env, "BRAND_ID" | "WEBHOOK_SECRET">) {
  const r = Router();

  r.get("/conversations", async (req, res, next) => {
    try {
      const q = z.object({
        q: z.string().trim().max(100).optional(),
        filter: z.enum(["all", "unread", "needs_reply", "resolved"]).default("all"),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }).parse(req.query);
      const where: string[] = [];
      const params: unknown[] = [];
      if (q.filter === "resolved") where.push(`v.status = 'resolved'`);
      else where.push(`v.status = 'open'`);
      if (q.filter === "needs_reply") where.push(`lm.sender = 'customer'`);
      if (q.q) {
        params.push(`%${q.q.replace(/[%_\\]/g, (m) => "\\" + m)}%`);
        where.push(`(c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length}
                     OR EXISTS (SELECT 1 FROM messages sm WHERE sm.conversation_id = v.id AND sm.body ILIKE $${params.length}))`);
      }
      let sql = `${LIST_SQL} WHERE ${where.join(" AND ")} ORDER BY v.last_message_at DESC LIMIT ${q.limit}`;
      if (q.filter === "unread") sql = `SELECT * FROM (${sql}) t WHERE t.unread > 0`;
      const rows = (await db.query(sql, params)).rows;
      res.json({ conversations: rows });
    } catch (e) { next(e); }
  });

  r.get("/conversations/:id", async (req, res, next) => {
    try {
      const id = uuid.safeParse(req.params.id);
      if (!id.success) throw new HttpError(404, "Conversation not found", "not_found");
      const conv = (await db.query(
        `SELECT v.id, v.status, v.created_at, v.last_message_at, c.id AS customer_uuid, c.name AS customer_name, c.phone AS customer_phone, c.external_id
           FROM conversations v JOIN customers c ON c.id = v.customer_id WHERE v.id = $1`, [id.data])).rows[0];
      if (!conv) throw new HttpError(404, "Conversation not found", "not_found");

      const messages = (await db.query(
        `SELECT id, sender, body, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at, id`, [id.data])).rows;
      const last = messages[messages.length - 1];

      // Current suggestion: a live (pending) draft wins; otherwise a failed attempt for the latest customer message.
      let draft = null as null | Record<string, unknown>;
      let draftState: "ready" | "generating" | "failed" | "missing" | "none" = "none";
      if (last?.sender === "customer") {
        const drafts = (await db.query(
          `SELECT id, message_id, status, body, needs_human, error, model, created_at FROM ai_drafts
            WHERE message_id = $1 ORDER BY created_at DESC`, [last.id])).rows;
        const pending = drafts.find((d) => d.status === "pending");
        const failed = drafts.find((d) => d.status === "failed");
        if (pending) { draft = pending; draftState = "ready"; }
        else if (failed) { draft = failed; draftState = "failed"; }
        else draftState = Date.now() - new Date(last.created_at).getTime() < 90_000 ? "generating" : "missing";
      }

      const history = (await db.query(
        `SELECT v.id, v.status, v.created_at, v.last_message_at,
                (SELECT body FROM messages m WHERE m.conversation_id = v.id AND m.sender = 'customer' ORDER BY m.created_at LIMIT 1) AS first_message,
                (SELECT count(*)::int FROM messages m WHERE m.conversation_id = v.id) AS message_count
           FROM conversations v WHERE v.customer_id = $1 AND v.id <> $2 ORDER BY v.created_at DESC LIMIT 10`,
        [conv.customer_uuid, id.data])).rows;

      res.json({
        conversation: { id: conv.id, status: conv.status, createdAt: conv.created_at, lastMessageAt: conv.last_message_at },
        customer: { name: conv.customer_name, phone: conv.customer_phone, externalId: conv.external_id },
        messages, draft, draftState, history,
      });
    } catch (e) { next(e); }
  });

  r.post("/conversations/:id/read", async (req, res, next) => {
    try {
      const id = uuid.parse(req.params.id);
      await db.query(`UPDATE conversations SET agent_last_read_at = now() WHERE id = $1`, [id]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  r.patch("/conversations/:id", async (req, res, next) => {
    try {
      const id = uuid.parse(req.params.id);
      const { status } = z.object({ status: z.enum(["open", "resolved"]) }).parse(req.body);
      try {
        const u = await db.query(`UPDATE conversations SET status = $2 WHERE id = $1 RETURNING id, status`, [id, status]);
        if (!u.rows[0]) throw new HttpError(404, "Conversation not found", "not_found");
        res.json({ conversation: u.rows[0] });
      } catch (e: any) {
        if (e?.code === "23505") throw new HttpError(409, "This customer already has another open conversation", "conflict");
        throw e;
      }
    } catch (e) { next(e); }
  });

  // (Re)generate a suggestion for the latest customer message. Synchronous: the agent is waiting on it.
  r.post("/conversations/:id/draft", async (req, res, next) => {
    try {
      const id = uuid.parse(req.params.id);
      const last = (await db.query(`SELECT id, sender FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`, [id])).rows[0];
      if (!last) throw new HttpError(404, "Conversation not found", "not_found");
      if (last.sender !== "customer") throw new HttpError(409, "There is no unanswered customer message to draft a reply for", "conflict");
      const draft = await generateDraft(db, llm, last.id);
      if (draft.status === "failed") throw new HttpError(502, `${draft.error}. Your messages are safe — try again in a moment.`, "ai_unavailable");
      res.json({ draft });
    } catch (e) { next(e); }
  });

  // Approve: saves the (possibly edited) text as the agent reply and marks the draft used. Atomic and not repeatable.
  r.post("/drafts/:id/approve", async (req, res, next) => {
    try {
      const id = uuid.parse(req.params.id);
      const { text } = textSchema.parse(req.body);
      const out = await tx(db, async (c) => {
        const d = (await c.query(`SELECT * FROM ai_drafts WHERE id = $1 FOR UPDATE`, [id])).rows[0];
        if (!d) throw new HttpError(404, "Draft not found", "not_found");
        if (d.status !== "pending") throw new HttpError(409, d.status === "used" ? "This draft was already approved" : "This draft is no longer current — refresh the conversation", "conflict");
        const msg = (await c.query(
          `INSERT INTO messages (conversation_id, sender, body, agent_id) VALUES ($1, 'agent', $2, $3) RETURNING id, sender, body, created_at`,
          [d.conversation_id, text, req.agent!.id])).rows[0];
        await c.query(`UPDATE ai_drafts SET status = 'used', used_at = now(), reply_message_id = $2, final_body = $3 WHERE id = $1`, [id, msg.id, text]);
        await c.query(`UPDATE conversations SET last_message_at = now(), agent_last_read_at = now() WHERE id = $1`, [d.conversation_id]);
        return { message: msg, edited: text !== d.body };
      });
      res.status(201).json(out);
    } catch (e) { next(e); }
  });

  // Free-form agent reply (message composer), for when no draft is wanted.
  r.post("/conversations/:id/replies", async (req, res, next) => {
    try {
      const id = uuid.parse(req.params.id);
      const { text } = textSchema.parse(req.body);
      const msg = await tx(db, async (c) => {
        const ok = (await c.query(`SELECT 1 FROM conversations WHERE id = $1 FOR UPDATE`, [id])).rowCount;
        if (!ok) throw new HttpError(404, "Conversation not found", "not_found");
        const m = (await c.query(
          `INSERT INTO messages (conversation_id, sender, body, agent_id) VALUES ($1, 'agent', $2, $3) RETURNING id, sender, body, created_at`,
          [id, text, req.agent!.id])).rows[0];
        await c.query(`UPDATE ai_drafts SET status = 'superseded' WHERE conversation_id = $1 AND status = 'pending'`, [id]);
        await c.query(`UPDATE conversations SET last_message_at = now(), agent_last_read_at = now() WHERE id = $1`, [id]);
        return m;
      });
      res.status(201).json({ message: msg });
    } catch (e) { next(e); }
  });

  r.get("/stats", async (_req, res, next) => {
    try {
      const totals = (await db.query(`
        SELECT
          (SELECT count(*)::int FROM conversations) AS total_conversations,
          (SELECT count(*)::int FROM conversations v WHERE v.status = 'open' AND
             (SELECT sender FROM messages WHERE conversation_id = v.id ORDER BY created_at DESC, id DESC LIMIT 1) = 'customer') AS pending_conversations,
          (SELECT count(*)::int FROM messages WHERE sender = 'agent') AS approved_replies,
          (SELECT count(*)::int FROM ai_drafts) AS drafts_total,
          (SELECT count(*)::int FROM ai_drafts WHERE status = 'used' AND final_body = body) AS drafts_sent_unedited,
          (SELECT count(*)::int FROM ai_drafts WHERE status = 'used' AND final_body <> body) AS drafts_edited,
          (SELECT count(*)::int FROM ai_drafts WHERE status = 'failed') AS drafts_failed,
          (SELECT count(*)::int FROM ai_drafts WHERE needs_human) AS drafts_escalated,
          (SELECT avg(extract(epoch FROM (a.created_at - c.first_at)))::float
             FROM messages a
             JOIN LATERAL (
               SELECT min(m.created_at) AS first_at FROM messages m
                WHERE m.conversation_id = a.conversation_id AND m.sender = 'customer' AND m.created_at < a.created_at
                  AND m.created_at > COALESCE((SELECT max(p.created_at) FROM messages p WHERE p.conversation_id = a.conversation_id AND p.sender = 'agent' AND p.created_at < a.created_at), '-infinity')
             ) c ON c.first_at IS NOT NULL
            WHERE a.sender = 'agent') AS avg_response_seconds`)).rows[0];
      const daily = (await db.query(`
        SELECT to_char(d::date, 'YYYY-MM-DD') AS day,
               (SELECT count(*)::int FROM messages WHERE sender = 'customer' AND created_at >= d AND created_at < d + interval '1 day') AS customer_messages,
               (SELECT count(*)::int FROM messages WHERE sender = 'agent' AND created_at >= d AND created_at < d + interval '1 day') AS agent_replies
          FROM generate_series(date_trunc('day', now()) - interval '6 days', date_trunc('day', now()), interval '1 day') d ORDER BY d`)).rows;
      res.json({ ...totals, daily });
    } catch (e) { next(e); }
  });

  r.get("/knowledge-base", (_req, res) => res.json({ entries: KNOWLEDGE_BASE }));

  r.get("/settings", (req, res) =>
    res.json({ agent: req.agent, brandId: env.BRAND_ID, webhookPath: "/webhook", signatureHeader: "X-Signature", signatureFormat: "sha256=<hex HMAC-SHA256 of the raw body>" }));

  return r;
}
