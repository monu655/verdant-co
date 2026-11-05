import { tx, type Db } from "../db/pool.js";
import { HttpError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { loadKnowledge } from "./knowledge.js";
import { LlmError, type LlmClient } from "./llm.js";

const HISTORY_LIMIT = 12;

/**
 * Generates a suggested reply for one customer message and stores it.
 * Never sends anything to the customer. On provider failure a `failed` draft row is stored
 * (no fake reply) so the agent can see the error and retry.
 */
export async function generateDraft(db: Db, llm: LlmClient, messageId: string) {
  const msg = await db.query(
    `SELECT m.id, m.conversation_id, m.sender, c.name AS customer_name
       FROM messages m
       JOIN conversations v ON v.id = m.conversation_id
       JOIN customers c ON c.id = v.customer_id
      WHERE m.id = $1`,
    [messageId],
  );
  const row = msg.rows[0];
  if (!row) throw new HttpError(404, "Message not found", "not_found");
  if (row.sender !== "customer") throw new HttpError(400, "Drafts can only answer customer messages", "bad_request");

  // Prompt context: everything the customer has actually seen (customer messages + approved agent replies) up to this message.
  const history = (
    await db.query(
      `SELECT sender, body FROM messages
        WHERE conversation_id = $1
          AND created_at <= (SELECT created_at FROM messages WHERE id = $2)
        ORDER BY created_at DESC, id DESC LIMIT $3`,
      [row.conversation_id, messageId, HISTORY_LIMIT],
    )
  ).rows.reverse();

  try {
    const knowledge = await loadKnowledge(db);
    const out = await llm.draftReply({ history, customerName: String(row.customer_name), knowledge });
    return await tx(db, async (c) => {
      // A newer suggestion replaces older live ones in this conversation: the agent reviews one draft at a time.
      await c.query(
        `UPDATE ai_drafts SET status = 'superseded'
          WHERE conversation_id = $1 AND status = 'pending'`,
        [row.conversation_id],
      );
      // Failed attempts for this message are history; a successful retry replaces them in the UI.
      const ins = await c.query(
        `INSERT INTO ai_drafts (message_id, conversation_id, status, body, needs_human, model)
         VALUES ($1, $2, 'pending', $3, $4, $5) RETURNING *`,
        [messageId, row.conversation_id, out.reply, out.needsHuman, out.model],
      );
      return ins.rows[0];
    });
  } catch (e) {
    const message = e instanceof LlmError ? e.message : "Draft generation failed unexpectedly";
    logger.error("draft_failed", { messageId, error: e instanceof Error ? e.message : String(e) });
    const ins = await db.query(
      `INSERT INTO ai_drafts (message_id, conversation_id, status, error)
       VALUES ($1, $2, 'failed', $3) RETURNING *`,
      [messageId, row.conversation_id, message],
    );
    return ins.rows[0];
  }
}

/**
 * Startup recovery: for open conversations whose latest message is from the customer and that have no draft
 * at all (the server stopped between saving the message and drafting), create the missing drafts.
 * Failed drafts are left for the agent to retry on purpose, so a broken provider is not hammered on every restart.
 */
export async function recoverMissingDrafts(db: Db, llm: LlmClient, maxAgeHours = 24): Promise<number> {
  const rows = (
    await db.query(
      `SELECT lm.id
         FROM conversations v
         JOIN LATERAL (SELECT id, sender, created_at FROM messages WHERE conversation_id = v.id ORDER BY created_at DESC, id DESC LIMIT 1) lm ON true
        WHERE v.status = 'open' AND lm.sender = 'customer'
          AND lm.created_at > now() - make_interval(hours => $1)
          AND NOT EXISTS (SELECT 1 FROM ai_drafts d WHERE d.message_id = lm.id)
        ORDER BY lm.created_at`,
      [maxAgeHours],
    )
  ).rows;
  for (const r of rows) await generateDraft(db, llm, r.id as string);
  return rows.length;
}
