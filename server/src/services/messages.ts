import { z } from "zod";
import { tx, type Db } from "../db/pool.js";
import { logger } from "../lib/logger.js";
import { generateDraft } from "./drafts.js";
import type { LlmClient } from "./llm.js";

export const MAX_MESSAGE_LENGTH = 2000;

export const inboundSchema = z.object({
  eventId: z.string().trim().min(1).max(200),
  source: z.enum(["webhook", "customer_view"]),
  brandId: z.string().trim().min(1).max(100),
  customer: z.object({
    id: z.string().trim().min(1).max(200),
    name: z.string().trim().min(1).max(200),
    phone: z.string().trim().min(3).max(32),
  }),
  message: z.object({
    id: z.string().trim().min(1).max(200),
    text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  }),
});
export type InboundMessage = z.infer<typeof inboundSchema>;

export type InboundResult =
  | { status: "processed"; conversationId: string; messageId: string }
  | { status: "duplicate"; conversationId?: string; messageId?: string };

/**
 * THE single entry point for customer messages. Both POST /webhook and the Customer view call this,
 * so storage, idempotency and drafting behave identically.
 *
 * 1. Atomically (one transaction): record the event id, upsert the customer, find/create the open
 *    conversation, insert the message. A repeated event id (or message id) changes nothing.
 * 2. After commit, draft generation runs separately, so an LLM outage can never lose a message.
 */
export async function receiveCustomerMessage(db: Db, input: InboundMessage): Promise<InboundResult> {
  const result = await tx(db, async (c): Promise<InboundResult> => {
    const ev = await c.query(
      `INSERT INTO webhook_events (event_id, source) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING RETURNING id`,
      [input.eventId, input.source],
    );
    if (ev.rowCount === 0) return { status: "duplicate" };

    const dup = await c.query(`SELECT id, conversation_id FROM messages WHERE external_id = $1`, [input.message.id]);
    if (dup.rows[0]) {
      await c.query(`UPDATE webhook_events SET status = 'processed', processed_at = now() WHERE event_id = $1`, [input.eventId]);
      return { status: "duplicate", messageId: dup.rows[0].id, conversationId: dup.rows[0].conversation_id };
    }

    const cust = await c.query(
      `INSERT INTO customers (brand_id, external_id, name, phone) VALUES ($1, $2, $3, $4)
       ON CONFLICT (brand_id, external_id) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, updated_at = now()
       RETURNING id`,
      [input.brandId, input.customer.id, input.customer.name, input.customer.phone],
    );
    const customerId = cust.rows[0].id as string;

    // One open conversation per customer (also guaranteed by a partial unique index).
    const conv = await c.query(
      `INSERT INTO conversations (customer_id, status) VALUES ($1, 'open')
       ON CONFLICT (customer_id) WHERE status = 'open' DO UPDATE SET last_message_at = now()
       RETURNING id`,
      [customerId],
    );
    const conversationId = conv.rows[0].id as string;

    const msg = await c.query(
      `INSERT INTO messages (conversation_id, sender, body, external_id, event_id) VALUES ($1, 'customer', $2, $3, $4) RETURNING id`,
      [conversationId, input.message.text, input.message.id, input.eventId],
    );
    await c.query(`UPDATE conversations SET last_message_at = now() WHERE id = $1`, [conversationId]);
    await c.query(`UPDATE webhook_events SET status = 'processed', processed_at = now() WHERE event_id = $1`, [input.eventId]);
    return { status: "processed", conversationId, messageId: msg.rows[0].id };
  });
  return result;
}

/** Fire-and-observe draft generation. Errors are recorded on a failed draft row, never thrown to the sender. */
export function startDraft(db: Db, llm: LlmClient, messageId: string): Promise<void> {
  return generateDraft(db, llm, messageId).then(
    () => undefined,
    (e) => logger.error("draft_unexpected_error", { messageId, error: e instanceof Error ? e.message : String(e) }),
  );
}
