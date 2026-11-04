import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import type { Db } from "../db/pool.js";
import type { Env } from "../config/env.js";
import { HttpError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export const COOKIE_NAME = "vc_session";
export const SESSION_HOURS = 12;

export interface AgentIdentity { id: string; email: string; name: string }

declare module "express-serve-static-core" {
  interface Request { agent?: AgentIdentity }
}

export function signSession(agentId: string, env: Pick<Env, "JWT_SECRET">): string {
  return jwt.sign({ sub: agentId }, env.JWT_SECRET, { expiresIn: `${SESSION_HOURS}h` });
}

export function requireAgent(db: Db, env: Pick<Env, "JWT_SECRET">): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.[COOKIE_NAME];
      if (!token) throw new HttpError(401, "Please sign in", "unauthenticated");
      let sub: string;
      try {
        const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
        sub = String(payload.sub);
      } catch {
        throw new HttpError(401, "Your session has expired. Please sign in again.", "unauthenticated");
      }
      const r = await db.query("SELECT id, email, name FROM agents WHERE id = $1", [sub]);
      if (!r.rows[0]) throw new HttpError(401, "Please sign in", "unauthenticated");
      req.agent = r.rows[0] as AgentIdentity;
      next();
    } catch (e) {
      next(e);
    }
  };
}

/** CSRF defence for cookie auth: browsers always send Origin on cross-site unsafe requests. */
export function sameOriginOnly(allowed: string[]): RequestHandler {
  return (req, _res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.get("origin");
    if (origin && !allowed.includes(origin)) {
      logger.warn("origin_rejected", { origin, hint: "Add this origin to CORS_ORIGIN (comma-separated) if it is your frontend" });
      return next(new HttpError(403, "Origin not allowed", "forbidden"));
    }
    next();
  };
}
