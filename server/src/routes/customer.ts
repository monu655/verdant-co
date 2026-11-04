import crypto from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { Db } from "../db/pool.js";
import type { Env } from "../config/env.js";
import type { LlmClient } from "../services/llm.js";
import { MAX_MESSAGE_LENGTH, receiveCustomerMessage, startDraft } from "../services/messages.js";
import { HttpError } from "../lib/errors.js";

// Demo customers for the Customer view. Real customers arrive through the webhook.
export const TEST_CUSTOMERS = [
  { id: "cust_1042", name: "Aisha Khan", phone: "+919800000001" },
  { id: "cust_1043", name: "Rohan Mehta", phone: "+919800000002" },
  { id: "cust_1044", name: "Priya Nair", phone: "+919800000003" },
];

export const SAMPLE_MESSAGES = [
  "Hi, my order #4471 hasn't arrived yet. Can I change the delivery address?",
  "What is your return policy?",
  "Do you deliver to Dubai?",
  "Is cash on delivery available for a ₹3,500 order?",
  "I think I'm allergic to the serum I bought. What should I do?",
];

const sendSchema = z.object({
  customer: z.object({
    id: z.string().trim().min(1).max(200).optional(),
    name: z.string().trim().min(1, "Name is required").max(100),
    phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number"),
  }),
  text: z.string().trim().min(1, "Message cannot be empty").max(MAX_MESSAGE_LENGTH),
});

const normalizePhone = (p: string) => p.replace(/[^\d+]/g, "");

export function customerRouter(db: Db, llm: LlmClient, env: Pick<Env, "BRAND_ID">) {
  const r = Router();
  r.use(rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: true, legacyHeaders: false }));

  r.get("/test-customers", (_req, res) => res.json({ customers: TEST_CUSTOMERS, sampleMessages: SAMPLE_MESSAGES }));

  r.post("/messages", async (req, res, next) => {
    try {
      const body = sendSchema.safeParse(req.body);
      if (!body.success) throw new HttpError(400, body.error.issues[0]?.message ?? "Invalid request", "validation");
      const phone = normalizePhone(body.data.customer.phone);
      const customerId = body.data.customer.id ?? `web_${phone.replace(/\D/g, "")}`;
      const uid = crypto.randomUUID();
      // Same service as the webhook: identical storage, dedupe and drafting.
      const result = await receiveCustomerMessage(db, {
        eventId: `web_evt_${uid}`,
        source: "customer_view",
        brandId: env.BRAND_ID,
        customer: { id: customerId, name: body.data.customer.name, phone },
        message: { id: `web_msg_${uid}`, text: body.data.text },
      });
      if (result.status !== "processed") throw new HttpError(409, "Duplicate message", "duplicate");
      void startDraft(db, llm, result.messageId);
      res.status(201).json({ customerId, messageId: result.messageId, conversationId: result.conversationId });
    } catch (e) { next(e); }
  });

  // The customer sees ONLY their own customer messages and agent messages (approved replies). Drafts are never exposed here.
  r.get("/conversation", async (req, res, next) => {
    try {
      const q = z.object({ customerId: z.string().min(1), phone: z.string().min(3) }).safeParse(req.query);
      if (!q.success) throw new HttpError(400, "customerId and phone are required", "validation");
      const cust = await db.query(
        `SELECT id, name, phone FROM customers WHERE brand_id = $1 AND external_id = $2`,
        [env.BRAND_ID, q.data.customerId],
      );
      const c = cust.rows[0];
      if (!c || normalizePhone(c.phone) !== normalizePhone(q.data.phone)) return res.json({ messages: [] });
      const msgs = await db.query(
        `SELECT m.id, m.sender, m.body, m.created_at
           FROM messages m JOIN conversations v ON v.id = m.conversation_id
          WHERE v.customer_id = $1 ORDER BY m.created_at, m.id`,
        [c.id],
      );
      res.json({ messages: msgs.rows });
    } catch (e) { next(e); }
  });
  return r;
}
