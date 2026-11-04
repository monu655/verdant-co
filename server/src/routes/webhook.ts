import express, { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/pool.js";
import type { Env } from "../config/env.js";
import type { LlmClient } from "../services/llm.js";
import { receiveCustomerMessage, startDraft } from "../services/messages.js";
import { verifySignature } from "../lib/signature.js";
import { logger } from "../lib/logger.js";

const payloadSchema = z.object({
  event_id: z.string().min(1),
  type: z.string().min(1),
  brand_id: z.string().min(1),
  timestamp: z.string().optional(),
  customer: z.object({ id: z.string().min(1), name: z.string().min(1), phone: z.string().min(3) }),
  message: z.object({ id: z.string().min(1), type: z.string().min(1), text: z.string().optional() }),
});

export function webhookRouter(db: Db, llm: LlmClient, env: Pick<Env, "WEBHOOK_SECRET" | "BRAND_ID">) {
  const r = Router();
  // express.raw keeps the exact bytes the sender signed; JSON is parsed only AFTER the signature checks out.
  r.post("/webhook", express.raw({ type: () => true, limit: "100kb" }), async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!verifySignature(raw, req.get("x-signature"), env.WEBHOOK_SECRET)) {
      logger.warn("webhook_bad_signature", { ip: req.ip });
      return res.status(401).json({ error: "invalid_signature" });
    }
    let json: unknown;
    try {
      json = JSON.parse(raw.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "invalid_json" });
    }
    const parsed = payloadSchema.safeParse(json);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_payload", details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    }
    const p = parsed.data;
    if (p.brand_id !== env.BRAND_ID) return res.status(422).json({ error: "unknown_brand" });
    // Acknowledge (2xx) events we deliberately do not handle so the sender does not retry them forever.
    if (p.type !== "message.received" || p.message.type !== "text") {
      return res.status(200).json({ status: "ignored", reason: "unsupported_event_or_message_type" });
    }
    const text = p.message.text?.trim();
    if (!text) return res.status(400).json({ error: "invalid_payload", details: ["message.text: required for text messages"] });
    if (text.length > 2000) return res.status(422).json({ error: "message_too_long" });

    try {
      const result = await receiveCustomerMessage(db, {
        eventId: p.event_id,
        source: "webhook",
        brandId: p.brand_id,
        customer: p.customer,
        message: { id: p.message.id, text },
      });
      if (result.status === "processed") {
        void startDraft(db, llm, result.messageId); // saved first; drafting happens after we acknowledge
        return res.status(200).json({ status: "processed", conversation_id: result.conversationId, message_id: result.messageId });
      }
      return res.status(200).json({ status: "duplicate" });
    } catch (e) {
      // Nothing was committed (single transaction), so the sender can safely retry the same event.
      logger.error("webhook_store_failed", { eventId: p.event_id, error: e instanceof Error ? e.message : String(e) });
      return res.status(500).json({ error: "temporarily_unavailable" });
    }
  });
  return r;
}
