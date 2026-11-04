# Verdant & Co: AI customer support

Customers message in (Customer view or signed webhook). An LLM drafts a reply from the knowledge base. A human agent edits and approves it. **Only approved replies ever reach the customer.**

**Live app:** _add your Vercel URL_ · **Webhook:** `POST <your Render URL>/webhook` · **Agent login:** _add the email/password you seeded_

## Run locally
```bash
npm install
cp server/.env.example server/.env     # set DATABASE_URL, JWT_SECRET, LLM_API_KEY, SEED_AGENT_EMAIL/PASSWORD
npm run dev:server                     # migrates the DB, seeds the agent, serves :8080
npm run dev:web                        # http://localhost:5173 (proxies /api and /webhook)
npm test                               # 29 tests against a real Postgres (TEST_DATABASE_URL)
```
Needs Node 20+ and Postgres (Supabase or local). Deploy steps: `DEPLOY.md`. Webhook test: `docs/WEBHOOK.md`.

## Main decisions
- **One intake service.** `receiveCustomerMessage` serves both the Customer view and `/webhook`, so storage, dedupe and drafting are identical.
- **Save first, draft second.** The customer, conversation, message and event id commit in one transaction. The LLM runs afterwards, so an AI outage never loses a message.
- **Webhook safety.** The route is mounted before the JSON parser and verifies HMAC-SHA256 over the exact raw bytes (constant-time compare). Duplicates are blocked by a unique `event_id` plus a unique message id, so concurrent redeliveries create one message.
- **Data model.** `agents, customers, conversations, messages, ai_drafts, webhook_events`. A partial unique index enforces one open conversation per customer. Drafts are separate rows (`pending / used / superseded / failed`), so what the AI wrote and what the agent sent are both kept.
- **Failure is visible, never faked.** If the provider fails, a `failed` draft with the reason is stored and the agent sees a Retry button. No placeholder reply is ever created.
- **Retrieval: the whole knowledge base goes in the prompt.** It is seven short policies, so this is simple and exact. It stops working when a brand's KB no longer fits comfortably in the context (roughly a few thousand tokens) or answers start getting missed. Then move to keyword or embedding top-k retrieval.
- **Auth.** bcrypt, JWT in an HTTP-only cookie, Origin check on state-changing routes, login rate limit.
- **Left out for time:** realtime (the UI polls every 3-4 s), an automatic retry queue for failed drafts, agent assignment, user management, alerting, and tests that call a real LLM (the client is tested against a local stand-in provider).

## AI use
I built this with Claude (Claude Code). It wrote most of the code and tests, and I directed and reviewed. **One thing it got wrong:** it added a CSRF Origin check that only allowed `http://localhost:5173`. The first real browser test opened the app at `127.0.0.1:5173`, and login failed with "Origin not allowed". The 29 API tests missed it because they send no Origin header. It was fixed by allowing a comma-separated `CORS_ORIGIN` list and logging the rejected origin.

## Two questions
**1. A message arrives at 2 a.m. and something fails.** The message is already saved, so the agent sees it in the list. If the AI failed, the conversation shows a red "The AI couldn't draft a reply" card with the reason and a Retry button. If the server died mid-draft, it shows "No draft was created" with Generate draft. If the database itself failed, the webhook returns 500 and nothing was committed, so the sender can redeliver the same event safely. To find the cause I would search the JSON logs (`draft_failed`, `webhook_store_failed`, `webhook_bad_signature`); failed drafts also show on the Analytics page. There is no alerting yet, and adding it is the first thing I would do.

**2. Twenty brands.** I would add tenancy first: a `brands` table, `brand_id` on agents, customers and conversations, and every agent query scoped to the agent's brand. A leak between brands is the worst failure, so it comes before anything else. Next, a per-brand knowledge base and webhook secret, with the brand taken from the URL (`/webhook/:brand`) so the right secret is chosen before the body is trusted.
