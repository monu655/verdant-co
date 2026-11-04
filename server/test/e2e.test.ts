import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AGENT, FakeLlm, login, postWebhook, setup, waitForDraft, webhookBody } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => { ctx = await setup(); });
afterAll(async () => { await ctx?.db.end(); });

describe("webhook", () => {
  it("accepts a correctly signed request, stores it, and drafts a reply", async () => {
    const res = await postWebhook(ctx.request, webhookBody());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("processed");
    await waitForDraft(ctx.db);
    const msgs = (await ctx.db.query("SELECT sender, body FROM messages")).rows;
    expect(msgs).toEqual([{ sender: "customer", body: expect.stringContaining("#4471") }]);
    const drafts = (await ctx.db.query("SELECT status, message_id FROM ai_drafts")).rows;
    expect(drafts[0].status).toBe("pending");
    const cust = (await ctx.db.query("SELECT external_id, name, phone FROM customers")).rows;
    expect(cust).toEqual([{ external_id: "cust_1042", name: "Aisha Khan", phone: "+919800000001" }]);
  });

  it("rejects a bad signature, a missing signature, and a body altered after signing", async () => {
    expect((await postWebhook(ctx.request, webhookBody(), { secret: "wrong-secret" })).status).toBe(401);
    expect((await ctx.request.post("/webhook").set("Content-Type", "application/json").send(webhookBody())).status).toBe(401);
    const raw = JSON.stringify(webhookBody());
    const sig = (await import("../src/lib/signature.js")).sign(raw, "verdant-demo-secret-2026");
    expect((await postWebhook(ctx.request, raw.replace("4471", "9999"), { signature: sig })).status).toBe(401);
    expect((await ctx.db.query("SELECT count(*)::int n FROM messages")).rows[0].n).toBe(0);
  });

  it("verifies against the exact raw bytes (non-canonical JSON whitespace still works)", async () => {
    const raw = `{ "event_id" : "evt_ws",\n "type":"message.received","brand_id":"verdant-co",\n"customer":{"id":"c1","name":"Ws","phone":"+911234567"},"message":{"id":"m_ws","type":"text","text":"What is your return policy?"} }`;
    expect((await postWebhook(ctx.request, raw)).status).toBe(200);
  });

  it("is idempotent: the same event delivered twice creates one message and one draft", async () => {
    const a = await postWebhook(ctx.request, webhookBody());
    const b = await postWebhook(ctx.request, webhookBody());
    expect(a.body.status).toBe("processed");
    expect(b.status).toBe(200);
    expect(b.body.status).toBe("duplicate");
    await waitForDraft(ctx.db);
    expect((await ctx.db.query("SELECT count(*)::int n FROM messages")).rows[0].n).toBe(1);
    expect((await ctx.db.query("SELECT count(*)::int n FROM ai_drafts")).rows[0].n).toBe(1);
  });

  it("handles simultaneous deliveries of the same event safely", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => postWebhook(ctx.request, webhookBody())));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => r.body.status === "processed")).toHaveLength(1);
    expect((await ctx.db.query("SELECT count(*)::int n FROM messages")).rows[0].n).toBe(1);
  });

  it("treats a re-sent message id under a new event id as a duplicate", async () => {
    await postWebhook(ctx.request, webhookBody());
    const res = await postWebhook(ctx.request, webhookBody({ event_id: "evt_other" }));
    expect(res.body.status).toBe("duplicate");
    expect((await ctx.db.query("SELECT count(*)::int n FROM messages")).rows[0].n).toBe(1);
  });

  it("keeps one open conversation per customer", async () => {
    await postWebhook(ctx.request, webhookBody());
    await postWebhook(ctx.request, webhookBody({ event_id: "evt_2", message: { id: "msg_2", type: "text", text: "What is your return policy?" } }));
    expect((await ctx.db.query("SELECT count(*)::int n FROM conversations")).rows[0].n).toBe(1);
    expect((await ctx.db.query("SELECT count(*)::int n FROM messages")).rows[0].n).toBe(2);
  });

  it("returns 400 for invalid payloads, 422 for another brand, and 2xx 'ignored' for unsupported types", async () => {
    expect((await postWebhook(ctx.request, "not json")).status).toBe(400);
    expect((await postWebhook(ctx.request, { event_id: "x" })).status).toBe(400);
    expect((await postWebhook(ctx.request, webhookBody({ brand_id: "other" }))).status).toBe(422);
    const img = await postWebhook(ctx.request, webhookBody({ event_id: "evt_img", message: { id: "m_img", type: "image" } }));
    expect(img.status).toBe(200);
    expect(img.body.status).toBe("ignored");
    expect((await ctx.db.query("SELECT count(*)::int n FROM messages")).rows[0].n).toBe(0);
  });

  it("still saves the message and acknowledges when the AI provider is down", async () => {
    ctx.llm.mode = "fail";
    const res = await postWebhook(ctx.request, webhookBody());
    expect(res.status).toBe(200);
    await waitForDraft(ctx.db);
    expect((await ctx.db.query("SELECT count(*)::int n FROM messages")).rows[0].n).toBe(1);
    const d = (await ctx.db.query("SELECT status, body, error FROM ai_drafts")).rows[0];
    expect(d.status).toBe("failed");
    expect(d.body).toBeNull(); // no fake reply
    expect(d.error).toMatch(/AI provider/);
  });
});

describe("full flow: customer view -> agent approves -> customer sees reply", () => {
  it("works end to end and never leaks drafts to the customer", async () => {
    const send = await ctx.request.post("/api/customer/messages").send({
      customer: { id: "cust_1042", name: "Aisha Khan", phone: "+919800000001" },
      text: "Hi, my order #4471 hasn't arrived yet. Can I change the delivery address?",
    });
    expect(send.status).toBe(201);
    await waitForDraft(ctx.db);

    // Customer view sees only their message — no draft.
    let view = await ctx.request.get("/api/customer/conversation").query({ customerId: "cust_1042", phone: "+919800000001" });
    expect(view.body.messages).toHaveLength(1);
    expect(JSON.stringify(view.body)).not.toContain("Draft for");

    // Agent routes need auth.
    expect((await ctx.request.get("/api/conversations")).status).toBe(401);
    const { res: loginRes, cookie } = await login(ctx.request);
    expect(loginRes.status).toBe(200);
    expect(cookie.join(";")).toMatch(/HttpOnly/i);

    const list = await ctx.request.get("/api/conversations").set("Cookie", cookie);
    expect(list.body.conversations).toHaveLength(1);
    expect(list.body.conversations[0]).toMatchObject({ customer_name: "Aisha Khan", unread: 1, needs_reply: true });

    const convId = list.body.conversations[0].id;
    const detail = await ctx.request.get(`/api/conversations/${convId}`).set("Cookie", cookie);
    expect(detail.body.draftState).toBe("ready");
    const draft = detail.body.draft;

    // Edit and approve.
    const edited = "Hi Aisha, the address can only be changed within 12 hours of ordering and before shipping.";
    const approve = await ctx.request.post(`/api/drafts/${draft.id}/approve`).set("Cookie", cookie).send({ text: edited });
    expect(approve.status).toBe(201);
    expect(approve.body.edited).toBe(true);

    // Double-approve is rejected, not duplicated.
    const again = await ctx.request.post(`/api/drafts/${draft.id}/approve`).set("Cookie", cookie).send({ text: edited });
    expect(again.status).toBe(409);
    expect((await ctx.db.query("SELECT count(*)::int n FROM messages WHERE sender = 'agent'")).rows[0].n).toBe(1);
    const row = (await ctx.db.query("SELECT status, final_body FROM ai_drafts WHERE id = $1", [draft.id])).rows[0];
    expect(row).toEqual({ status: "used", final_body: edited });

    view = await ctx.request.get("/api/customer/conversation").query({ customerId: "cust_1042", phone: "+919800000001" });
    expect(view.body.messages.map((m: any) => m.sender)).toEqual(["customer", "agent"]);
    expect(view.body.messages[1].body).toBe(edited);

    const stats = await ctx.request.get("/api/stats").set("Cookie", cookie);
    expect(stats.body).toMatchObject({ total_conversations: 1, pending_conversations: 0, approved_replies: 1, drafts_edited: 1 });
    expect(stats.body.avg_response_seconds).toBeGreaterThanOrEqual(0);
  });

  it("customer conversation requires the matching phone number", async () => {
    await ctx.request.post("/api/customer/messages").send({ customer: { id: "cust_1042", name: "Aisha", phone: "+919800000001" }, text: "hello there" });
    const wrong = await ctx.request.get("/api/customer/conversation").query({ customerId: "cust_1042", phone: "+910000000000" });
    expect(wrong.body.messages).toEqual([]);
  });

  it("validates customer input", async () => {
    expect((await ctx.request.post("/api/customer/messages").send({ customer: { name: "A", phone: "abc" }, text: "hi" })).status).toBe(400);
    expect((await ctx.request.post("/api/customer/messages").send({ customer: { name: "A", phone: "+919800000001" }, text: "   " })).status).toBe(400);
  });

  it("typed (new) customers get a stable id derived from their phone", async () => {
    const a = await ctx.request.post("/api/customer/messages").send({ customer: { name: "New Person", phone: "+91 98000 00077" }, text: "one" });
    const b = await ctx.request.post("/api/customer/messages").send({ customer: { name: "New Person", phone: "+919800000077" }, text: "two" });
    expect(a.body.customerId).toBe(b.body.customerId);
    expect(a.body.conversationId).toBe(b.body.conversationId);
  });
});

describe("AI failure handling", () => {
  it("shows a failed state, then a retry succeeds and replaces it", async () => {
    ctx.llm.mode = "fail";
    await ctx.request.post("/api/customer/messages").send({ customer: { id: "c9", name: "Rohan", phone: "+919800000002" }, text: "What is your return policy?" });
    await waitForDraft(ctx.db);
    const { cookie } = await login(ctx.request);
    const convId = (await ctx.request.get("/api/conversations").set("Cookie", cookie)).body.conversations[0].id;
    let detail = await ctx.request.get(`/api/conversations/${convId}`).set("Cookie", cookie);
    expect(detail.body.draftState).toBe("failed");
    expect(detail.body.draft.error).toMatch(/AI provider/);

    const retryFail = await ctx.request.post(`/api/conversations/${convId}/draft`).set("Cookie", cookie);
    expect(retryFail.status).toBe(502);

    ctx.llm.mode = "ok";
    const retry = await ctx.request.post(`/api/conversations/${convId}/draft`).set("Cookie", cookie);
    expect(retry.status).toBe(200);
    detail = await ctx.request.get(`/api/conversations/${convId}`).set("Cookie", cookie);
    expect(detail.body.draftState).toBe("ready");
  });

  it("a failed regenerate keeps the existing good draft", async () => {
    await ctx.request.post("/api/customer/messages").send({ customer: { id: "c9", name: "Rohan", phone: "+919800000002" }, text: "What is your return policy?" });
    await waitForDraft(ctx.db);
    const { cookie } = await login(ctx.request);
    const convId = (await ctx.request.get("/api/conversations").set("Cookie", cookie)).body.conversations[0].id;
    ctx.llm.mode = "fail";
    expect((await ctx.request.post(`/api/conversations/${convId}/draft`).set("Cookie", cookie)).status).toBe(502);
    const detail = await ctx.request.get(`/api/conversations/${convId}`).set("Cookie", cookie);
    expect(detail.body.draftState).toBe("ready");
  });

  it("does not auto-send: a failed or pending draft never becomes an agent message", async () => {
    await ctx.request.post("/api/customer/messages").send({ customer: { id: "c9", name: "R", phone: "+919800000002" }, text: "Do you deliver to Dubai?" });
    await waitForDraft(ctx.db);
    expect((await ctx.db.query("SELECT count(*)::int n FROM messages WHERE sender = 'agent'")).rows[0].n).toBe(0);
  });
});

describe("drafts: newer message supersedes, needs_human flag, missing draft recovery", () => {
  it("supersedes older pending drafts and surfaces escalation", async () => {
    const c = { id: "c1", name: "Aisha", phone: "+919800000001" };
    await ctx.request.post("/api/customer/messages").send({ customer: c, text: "What is your return policy?" });
    await waitForDraft(ctx.db, 1);
    await ctx.request.post("/api/customer/messages").send({ customer: c, text: "Do you deliver to Dubai?" });
    await waitForDraft(ctx.db, 2);
    const states = (await ctx.db.query("SELECT status FROM ai_drafts ORDER BY created_at")).rows.map((r) => r.status);
    expect(states).toEqual(["superseded", "pending"]);
    const { cookie } = await login(ctx.request);
    const convId = (await ctx.request.get("/api/conversations").set("Cookie", cookie)).body.conversations[0].id;
    const d = (await ctx.request.get(`/api/conversations/${convId}`).set("Cookie", cookie)).body;
    expect(d.draft.needs_human).toBe(true);
    // The model saw the whole conversation so far.
    expect(ctx.llm.calls[1]!.history.map((h) => h.body)).toEqual(["What is your return policy?", "Do you deliver to Dubai?"]);
  });

  it("offers recovery when a message has no draft (e.g. server restarted mid-job)", async () => {
    await ctx.db.query(`INSERT INTO customers (brand_id, external_id, name, phone) VALUES ('verdant-co','c5','Old','+911111111')`);
    const cid = (await ctx.db.query("SELECT id FROM customers")).rows[0].id;
    const conv = (await ctx.db.query("INSERT INTO conversations (customer_id) VALUES ($1) RETURNING id", [cid])).rows[0].id;
    await ctx.db.query(`INSERT INTO messages (conversation_id, sender, body, created_at) VALUES ($1,'customer','hello', now() - interval '10 minutes')`, [conv]);
    const { cookie } = await login(ctx.request);
    const d = (await ctx.request.get(`/api/conversations/${conv}`).set("Cookie", cookie)).body;
    expect(d.draftState).toBe("missing");
    expect((await ctx.request.post(`/api/conversations/${conv}/draft`).set("Cookie", cookie)).status).toBe(200);
  });
});

describe("agent auth and list", () => {
  it("rejects wrong credentials and unknown emails with the same message", async () => {
    const a = await ctx.request.post("/api/auth/login").send({ email: AGENT.email, password: "nope-nope-nope" });
    const b = await ctx.request.post("/api/auth/login").send({ email: "ghost@test.local", password: "nope-nope-nope" });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
  });

  it("stores passwords hashed", async () => {
    const h = (await ctx.db.query("SELECT password_hash FROM agents")).rows[0].password_hash as string;
    expect(h).not.toContain(AGENT.password);
    expect(h).toMatch(/^\$2[aby]\$/);
  });

  it("blocks cross-site state-changing requests", async () => {
    const { cookie } = await login(ctx.request);
    const res = await ctx.request.post("/api/auth/logout").set("Origin", "https://evil.example").set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  it("sorts by latest activity and searches by name and message text", async () => {
    await ctx.request.post("/api/customer/messages").send({ customer: { id: "a", name: "Alpha", phone: "+911111111" }, text: "first one" });
    await ctx.request.post("/api/customer/messages").send({ customer: { id: "b", name: "Bravo", phone: "+922222222" }, text: "second cod question" });
    await ctx.request.post("/api/customer/messages").send({ customer: { id: "a", name: "Alpha", phone: "+911111111" }, text: "third" });
    await waitForDraft(ctx.db, 3);
    const { cookie } = await login(ctx.request);
    const names = (await ctx.request.get("/api/conversations").set("Cookie", cookie)).body.conversations.map((c: any) => c.customer_name);
    expect(names).toEqual(["Alpha", "Bravo"]);
    const found = (await ctx.request.get("/api/conversations?q=cod").set("Cookie", cookie)).body.conversations;
    expect(found.map((c: any) => c.customer_name)).toEqual(["Bravo"]);
    expect((await ctx.request.get("/api/conversations?q=100%25").set("Cookie", cookie)).body.conversations).toHaveLength(0);
  });

  it("marks conversations read and resolves them; a new message then opens a fresh conversation", async () => {
    const c = { id: "a", name: "Alpha", phone: "+911111111" };
    await ctx.request.post("/api/customer/messages").send({ customer: c, text: "hello" });
    await waitForDraft(ctx.db);
    const { cookie } = await login(ctx.request);
    const id = (await ctx.request.get("/api/conversations").set("Cookie", cookie)).body.conversations[0].id;
    await ctx.request.post(`/api/conversations/${id}/read`).set("Cookie", cookie);
    expect((await ctx.request.get("/api/conversations?filter=unread").set("Cookie", cookie)).body.conversations).toHaveLength(0);
    expect((await ctx.request.patch(`/api/conversations/${id}`).set("Cookie", cookie).send({ status: "resolved" })).status).toBe(200);
    await ctx.request.post("/api/customer/messages").send({ customer: c, text: "one more thing" });
    expect((await ctx.db.query("SELECT count(*)::int n FROM conversations")).rows[0].n).toBe(2);
    expect((await ctx.request.patch(`/api/conversations/${id}`).set("Cookie", cookie).send({ status: "open" })).status).toBe(409);
  });
});

describe("session check", () => {
  it("/api/auth/me answers 200 with null when signed out, and the agent when signed in", async () => {
    const out = await ctx.request.get("/api/auth/me");
    expect(out.status).toBe(200);
    expect(out.body.agent).toBeNull();
    const { cookie } = await login(ctx.request);
    const inn = await ctx.request.get("/api/auth/me").set("Cookie", cookie);
    expect(inn.body.agent.email).toBe(AGENT.email);
  });
});
