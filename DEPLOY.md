# Deployment (Supabase + Render + Vercel)

1. **Supabase.** Create a project. Under Project Settings > Database, copy the *pooler* connection string. The server creates its own tables on first start (`npm run migrate`), so there is no manual SQL.
2. **Render (API).** New > Blueprint, pick this repo (`render.yaml`). Set `DATABASE_URL`, `LLM_API_KEY`, `SEED_AGENT_EMAIL`, `SEED_AGENT_PASSWORD`. Set `CORS_ORIGIN` to your Vercel URL after step 3. Free instances sleep when idle, so the first request can take about 30 s. Open the app before a demo.
3. **Vercel (web).** Import the repo, set Root Directory to `web`. Edit `web/vercel.json` and replace `YOUR-RENDER-SERVICE` with your Render hostname. The rewrite makes `/api` same-origin, so the cookie is first-party.
4. **Check.** Open `<render URL>/health` (expects `{"ok":true}`), sign in on the Vercel URL, and run the curl test in `docs/WEBHOOK.md` against the Render URL.

Give reviewers the **Render** URL for the webhook (`<render URL>/webhook`), not the Vercel one.
