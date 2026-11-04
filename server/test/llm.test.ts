import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LlmError, OpenRouterClient, SYSTEM_PROMPT, parseModelOutput } from "../src/services/llm.js";
import { KNOWLEDGE_BASE } from "../src/services/knowledge.js";

// A local stand-in for the provider HTTP API: tests the real client's request/response/error handling.
let server: http.Server;
let baseUrl: string;
let behaviour: (req: http.IncomingMessage, body: any, res: http.ServerResponse) => void = () => {};
let lastBody: any;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => { lastBody = JSON.parse(data || "{}"); behaviour(req, lastBody, res); });
  });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const client = (opts: { key?: string | null; timeout?: number } = {}) =>
  new OpenRouterClient({ LLM_API_KEY: opts.key === null ? undefined : (opts.key ?? "k"), LLM_BASE_URL: baseUrl, LLM_MODEL: "m", LLM_TIMEOUT_MS: opts.timeout ?? 2000 });
const req = { customerName: "Aisha", history: [{ sender: "customer" as const, body: "What is your return policy?" }] };
const reply = (res: http.ServerResponse, content: string) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ choices: [{ message: { content } }] })); };

describe("OpenRouterClient", () => {
  it("sends the knowledge-base prompt and parses a JSON reply", async () => {
    behaviour = (_r, _b, res) => reply(res, '```json\n{"reply":"Returns are accepted within 7 days.","needs_human":false}\n```');
    const out = await client().draftReply(req);
    expect(out).toEqual({ reply: "Returns are accepted within 7 days.", needsHuman: false, model: "m" });
    expect(lastBody.messages[0].role).toBe("system");
    expect(lastBody.messages[0].content).toContain("7 days of delivery");
  });
  it("fails clearly without an API key (no fake reply)", async () => {
    await expect(client({ key: null }).draftReply(req)).rejects.toThrow(/LLM_API_KEY/);
  });
  it("maps HTTP errors, malformed output and timeouts to LlmError", async () => {
    behaviour = (_r, _b, res) => { res.statusCode = 429; res.end("{}"); };
    await expect(client().draftReply(req)).rejects.toThrow(/HTTP 429/);
    behaviour = (_r, _b, res) => reply(res, "Sure! Here is a reply but no json");
    await expect(client().draftReply(req)).rejects.toBeInstanceOf(LlmError);
    behaviour = (_r, _b, res) => reply(res, '{"reply":"","needs_human":false}');
    await expect(client().draftReply(req)).rejects.toBeInstanceOf(LlmError);
    behaviour = () => { /* never responds */ };
    await expect(client({ timeout: 150 }).draftReply(req)).rejects.toThrow(/timed out/);
  });
});

describe("prompt and parsing", () => {
  it("embeds every knowledge-base policy and the safety rules", () => {
    for (const k of KNOWLEDGE_BASE) expect(SYSTEM_PROMPT).toContain(k.policy);
    expect(SYSTEM_PROMPT).toMatch(/allerg/i);
    expect(SYSTEM_PROMPT).toMatch(/needs_human/);
  });
  it("parses JSON embedded in prose", () => {
    expect(parseModelOutput('Here you go: {"reply":"Hi","needs_human":true} thanks')).toEqual({ reply: "Hi", needsHuman: true });
  });
});
