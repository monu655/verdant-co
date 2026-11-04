import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_SSL: z.enum(["true", "false"]).default("false"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  WEBHOOK_SECRET: z.string().min(1, "WEBHOOK_SECRET is required"),
  BRAND_ID: z.string().default("verdant-co"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().default("https://openrouter.ai/api/v1"),
  LLM_MODEL: z.string().default("meta-llama/llama-3.3-70b-instruct:free"),
  LLM_TIMEOUT_MS: z.coerce.number().default(25000),
  SEED_AGENT_EMAIL: z.string().email().optional(),
  SEED_AGENT_PASSWORD: z.string().min(8).optional(),
  SEED_AGENT_NAME: z.string().default("Support Agent"),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }
  return parsed.data;
}
