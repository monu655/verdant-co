import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FakeLlm, login, setup, waitForDraft } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => { ctx = await setup(); });
afterAll(async () => { await ctx?.db.end(); });

const customer = { id: "cust_1042", name: "Aisha Khan", phone: "+919800000001" };
async function customerSends(text: string) {
  const r = await ctx.request.post("/api/customer/messages").send({ customer, text });
  expect(r.status).toBe(201);
  await waitForDraft(ctx.db);
  return r.body as { messageId: string; conversationId: string };
}

describe("customer edits their own message", () => {
  it("rewrites the draft from the new text, keeps the original, and shows Edited", async () => {
    const { messageId } = await customerSends("Do you deliver to Dubai?");
    const llm = ctx.llm as FakeLlm;
    const before = llm.calls.length;

    const r = await ctx.request.patch(`/api/customer/messages/${messageId}`).send({ customer: { id: customer.id, phone: customer.phone }, text: "What is your return policy?" });
    expect(r.status).toBe(200);
    expect(r.body.changed).toBe(true);
    for (let i = 0; i < 50 && llm.calls.length === before; i++) await new Promise((res) => setTimeout(res, 20));
    for (let i = 0; i < 50; i++) { // wait until the replacement draft has been stored
      if ((await ctx.db.query(`SELECT count(*)::int AS n FROM ai_drafts WHERE status = 'pending'`)).rows[0].n === 1) break;
      await new Promise((res) => setTimeout(res, 20));
    }

    const row = (await ctx.db.query(`SELECT body, original_body, edited_at FROM messages WHERE id = $1`, [messageId])).rows[0];
    expect(row.body).toBe("What is your return policy?");
    expect(row.original_body).toBe("Do you deliver to Dubai?");
    expect(row.edited_at).not.toBeNull();

    expect(llm.calls.length).toBeGreaterThan(before);
    const pending = (await ctx.db.query(`SELECT count(*)::int AS n FROM ai_drafts WHERE status = 'pending'`)).rows[0].n;
    expect(pending).toBe(1); // the stale draft was retired, only the new one is live

    const seen = await ctx.request.get(`/api/customer/conversation?customerId=${customer.id}&phone=${encodeURIComponent(customer.phone)}`);
    expect(seen.body.messages[0].edited_at).not.toBeNull();
  });

  it("is locked once an agent has replied, and refuses other people's messages", async () => {
    const { messageId, conversationId } = await customerSends("Is COD available?");
    const { cookie } = await login(ctx.request);
    await ctx.request.post(`/api/conversations/${conversationId}/replies`).set("Cookie", cookie).send({ text: "Yes, under ₹3,000." });

    const locked = await ctx.request.patch(`/api/customer/messages/${messageId}`).send({ customer: { id: customer.id, phone: customer.phone }, text: "changed" });
    expect(locked.status).toBe(409);

    const stranger = await ctx.request.patch(`/api/customer/messages/${messageId}`).send({ customer: { id: "cust_1043", phone: "+919800000002" }, text: "hacked" });
    expect(stranger.status).toBe(404);
    const wrongPhone = await ctx.request.patch(`/api/customer/messages/${messageId}`).send({ customer: { id: customer.id, phone: "+911111111111" }, text: "hacked" });
    expect(wrongPhone.status).toBe(404);
    expect((await ctx.db.query(`SELECT body FROM messages WHERE id = $1`, [messageId])).rows[0].body).toBe("Is COD available?");
  });
});

describe("agent edits a sent reply", () => {
  it("updates the text, keeps the original and shows Edited to the customer", async () => {
    const { conversationId } = await customerSends("Is COD available?");
    const { cookie } = await login(ctx.request);
    const sent = await ctx.request.post(`/api/conversations/${conversationId}/replies`).set("Cookie", cookie).send({ text: "Yes, under 3000 rupees." });
    const id = sent.body.message.id as string;

    expect((await ctx.request.patch(`/api/messages/${id}`).send({ text: "x" })).status).toBe(401);
    const ok = await ctx.request.patch(`/api/messages/${id}`).set("Cookie", cookie).send({ text: "Yes, under ₹3,000, with a ₹50 fee." });
    expect(ok.status).toBe(200);
    expect(ok.body.message.edited_at).not.toBeNull();

    const row = (await ctx.db.query(`SELECT body, original_body FROM messages WHERE id = $1`, [id])).rows[0];
    expect(row).toEqual({ body: "Yes, under ₹3,000, with a ₹50 fee.", original_body: "Yes, under 3000 rupees." });
    const seen = await ctx.request.get(`/api/customer/conversation?customerId=${customer.id}&phone=${encodeURIComponent(customer.phone)}`);
    const reply = seen.body.messages.find((m: { sender: string }) => m.sender === "agent");
    expect(reply.body).toContain("₹50");
    expect(reply.edited_at).not.toBeNull();
  });

  it("only edits agent replies and validates the text", async () => {
    const { messageId } = await customerSends("Hello there");
    const { cookie } = await login(ctx.request);
    expect((await ctx.request.patch(`/api/messages/${messageId}`).set("Cookie", cookie).send({ text: "rewrite the customer" })).status).toBe(403);
    expect((await ctx.request.patch("/api/messages/not-a-uuid").set("Cookie", cookie).send({ text: "x" })).status).toBe(404);
  });
});
