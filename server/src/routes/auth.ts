import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { Db } from "../db/pool.js";
import type { Env } from "../config/env.js";
import { COOKIE_NAME, SESSION_HOURS, requireAgent, signSession } from "../middleware/auth.js";
import { HttpError } from "../lib/errors.js";

// Compared against when the email is unknown so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

export function authRouter(db: Db, env: Pick<Env, "JWT_SECRET" | "NODE_ENV">) {
  const r = Router();
  const cookieOpts = { httpOnly: true, sameSite: "lax" as const, secure: env.NODE_ENV === "production", path: "/", maxAge: SESSION_HOURS * 3600_000 };

  r.post(
    "/login",
    rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true }),
    async (req, res, next) => {
      try {
        const body = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(200) }).safeParse(req.body);
        if (!body.success) throw new HttpError(400, "Enter a valid email and password", "validation");
        const row = (await db.query("SELECT id, email, name, password_hash FROM agents WHERE lower(email) = lower($1)", [body.data.email])).rows[0];
        const ok = await bcrypt.compare(body.data.password, row?.password_hash ?? DUMMY_HASH);
        if (!row || !ok) throw new HttpError(401, "Incorrect email or password", "invalid_credentials");
        res.cookie(COOKIE_NAME, signSession(row.id, env), cookieOpts);
        res.json({ agent: { id: row.id, email: row.email, name: row.name } });
      } catch (e) { next(e); }
    },
  );

  r.post("/logout", (_req, res) => {
    res.clearCookie(COOKIE_NAME, { ...cookieOpts, maxAge: undefined });
    res.json({ ok: true });
  });

  // Signed-out is a normal answer here (not an error), so the browser console stays clean.
  r.get("/me", (req, res, next) => {
    requireAgent(db, env)(req, res, (err?: unknown) => {
      if (err instanceof HttpError && err.status === 401) return res.json({ agent: null });
      if (err) return next(err);
      res.json({ agent: req.agent });
    });
  });
  return r;
}
