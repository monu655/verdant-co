import { tx, type Db } from "../db/pool.js";
import { HttpError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
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
    const out = await llm.draftReply({ history, customerName: String(row.customer_name) });
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
