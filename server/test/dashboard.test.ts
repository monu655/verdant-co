import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FakeLlm, login, postWebhook, setup, waitForDraft, webhookBody } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => { ctx = await setup(); });
afterAll(async () => { await ctx?.db.end(); });

describe("knowledge base management", () => {
  it("requires sign-in, starts with the seven policies, and supports add / edit / delete / reset", async () => {
    expect((await ctx.request.get("/api/knowledge-base")).status).toBe(401);
    const { cookie } = await login(ctx.request);
    const list = await ctx.request.get("/api/knowledge-base").set("Cookie", cookie);
    expect(list.body.entries).toHaveLength(7);

    const bad = await ctx.request.post("/api/knowledge-base").set("Cookie", cookie).send({ topic: "x", policy: "short" });
    expect(bad.status).toBe(400);

    const add = await ctx.request.post("/api/knowledge-base").set("Cookie", cookie).send({ topic: "Gift wrap", policy: "Gift wrapping is free on orders above ₹1,500." });
    expect(add.status).toBe(201);
    const id = add.body.entry.id;

    const edit = await ctx.request.patch(`/api/knowledge-base/${id}`).set("Cookie", cookie).send({ topic: "Gift wrap", policy: "Gift wrapping is free on orders above ₹2,000." });
    expect(edit.body.entry.policy).toContain("2,000");

    expect((await ctx.request.patch("/api/knowledge-base/not-a-uuid").set("Cookie", cookie).send({ topic: "Gift wrap", policy: "Gift wrapping is free." })).status).toBe(404);

    expect((await ctx.request.delete(`/api/knowledge-base/${id}`).set("Cookie", cookie)).status).toBe(200);
    expect((await ctx.request.delete(`/api/knowledge-base/${id}`).set("Cookie", cookie)).status).toBe(404);

    await ctx.request.post("/api/knowledge-base").set("Cookie", cookie).send({ topic: "Temp", policy: "A temporary policy for testing." });
    const reset = await ctx.request.post("/api/knowledge-base/reset").set("Cookie", cookie);
    expect(reset.body.entries).toHaveLength(7);
  });

  it("never lets the last entry be deleted", async () => {
    const { cookie } = await login(ctx.request);
    const entries = (await ctx.request.get("/api/knowledge-base").set("Cookie", cookie)).body.entries as { id: string }[];
    for (const e of entries.slice(1)) expect((await ctx.request.delete(`/api/knowledge-base/${e.id}`).set("Cookie", cookie)).status).toBe(200);
    expect((await ctx.request.delete(`/api/knowledge-base/${entries[0]!.id}`).set("Cookie", cookie)).status).toBe(409);
  });

  it("gives the AI the edited knowledge base on the next draft", async () => {
    const { cookie } = await login(ctx.request);
    await ctx.request.post("/api/knowledge-base").set("Cookie", cookie).send({ topic: "Gift wrap", policy: "Gift wrapping is free on orders above ₹1,500." });
    const llm = ctx.llm as FakeLlm;
    await postWebhook(ctx.request, webhookBody());
    await waitForDraft(ctx.db);
    const used = llm.calls[llm.calls.length - 1]!.knowledge!;
    expect(used.map((k) => k.topic)).toContain("Gift wrap");
  });
});

describe("knowledge base playground", () => {
  it("answers a test question from the live knowledge base without storing anything", async () => {
    const { cookie } = await login(ctx.request);
    const r = await ctx.request.post("/api/knowledge-base/test").set("Cookie", cookie).send({ question: "What is your return policy?" });
    expect(r.status).toBe(200);
    expect(r.body.reply).toContain("Draft for");
    expect((await ctx.db.query("SELECT count(*)::int AS n FROM messages")).rows[0].n).toBe(0);
    expect((await ctx.request.post("/api/knowledge-base/test").set("Cookie", cookie).send({ question: "?" })).status).toBe(400);
    (ctx.llm as FakeLlm).mode = "fail";
    expect((await ctx.request.post("/api/knowledge-base/test").set("Cookie", cookie).send({ question: "What is your return policy?" })).status).toBe(502);
  });
});

describe("stats and activity", () => {
  it("returns period figures, topics and a daily series of the requested length", async () => {
    const { cookie } = await login(ctx.request);
    await postWebhook(ctx.request, webhookBody());
    await waitForDraft(ctx.db);
    const s7 = await ctx.request.get("/api/stats").set("Cookie", cookie);
    expect(s7.status).toBe(200);
    expect(s7.body.daily).toHaveLength(7);
    expect(s7.body.period.customer_messages).toBe(1);
    expect(s7.body.topics.find((t: { label: string }) => t.label === "Shipping and delivery").count).toBe(1);
    const s30 = await ctx.request.get("/api/stats?days=30").set("Cookie", cookie);
    expect(s30.body.daily).toHaveLength(30);
    expect((await ctx.request.get("/api/stats?days=5").set("Cookie", cookie)).status).toBe(400);

    const act = await ctx.request.get("/api/activity").set("Cookie", cookie);
    expect(act.body.events[0]).toMatchObject({ sender: "customer", customer_name: "Aisha Khan" });
    expect((await ctx.request.get("/api/activity")).status).toBe(401);
  });
});

describe("settings and inbox counts", () => {
  it("offers a signed sample event that the webhook accepts, and reports system status", async () => {
    const { cookie } = await login(ctx.request);
    expect((await ctx.request.get("/api/settings/webhook-sample")).status).toBe(401);
    const set = await ctx.request.get("/api/settings").set("Cookie", cookie);
    expect(set.body.webhookUrl).toMatch(/\/webhook$/);
    expect(set.body.status).toMatchObject({ database: true, knowledgeEntries: 7 });
    expect(JSON.stringify(set.body)).not.toContain("verdant-demo-secret");

    const sample = (await ctx.request.get("/api/settings/webhook-sample").set("Cookie", cookie)).body;
    const res = await ctx.request.post("/webhook").set("Content-Type", "application/json").set("X-Signature", sample.signature).send(sample.payload);
    expect(res.status).toBe(200);
    expect(JSON.stringify(sample)).not.toContain("verdant-demo-secret");
  });

  it("returns tab counts with the conversation list", async () => {
    const { cookie } = await login(ctx.request);
    await postWebhook(ctx.request, webhookBody());
    await waitForDraft(ctx.db);
    const r = await ctx.request.get("/api/conversations").set("Cookie", cookie);
    expect(r.body.counts).toEqual({ open: 1, needs_reply: 1, unread: 1, resolved: 0 });
  });
});
