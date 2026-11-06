export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      credentials: "include",
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.", "network");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.message ?? "Something went wrong. Please try again.", data?.error);
  return data as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

// ---- Types (mirror the server responses) ----
export interface Agent { id: string; email: string; name: string }
export interface ConversationSummary {
  id: string; status: "open" | "resolved"; last_message_at: string;
  customer_name: string; customer_phone: string; last_body: string; last_sender: "customer" | "agent";
  unread: number; needs_reply: boolean; has_draft: boolean;
}
export interface Message { id: string; sender: "customer" | "agent"; body: string; created_at: string; edited_at?: string | null }
export interface Draft { id: string; message_id: string; status: "pending" | "failed" | "used" | "superseded"; body: string | null; needs_human: boolean; error: string | null; model: string | null }
export type DraftState = "ready" | "generating" | "failed" | "missing" | "none";
export interface ConversationDetail {
  conversation: { id: string; status: "open" | "resolved"; createdAt: string; lastMessageAt: string };
  customer: { name: string; phone: string; externalId: string };
  messages: Message[]; draft: Draft | null; draftState: DraftState;
  history: { id: string; status: string; created_at: string; first_message: string | null; message_count: number }[];
}
export interface Stats {
  total_conversations: number; open_conversations: number; resolved_conversations: number; total_customers: number;
  pending_conversations: number; approved_replies: number; avg_response_seconds: number | null;
  drafts_total: number; drafts_sent_unedited: number; drafts_edited: number; drafts_failed: number; drafts_escalated: number;
  days: 7 | 30;
  daily: { day: string; customer_messages: number; agent_replies: number }[];
  period: {
    customer_messages: number; prev_customer_messages: number; agent_replies: number; prev_agent_replies: number;
    new_conversations: number; prev_new_conversations: number; avg_response_seconds: number | null; prev_avg_response_seconds: number | null;
  };
  topics: { label: string; count: number }[];
}
export interface KbEntry { id: string; topic: string; policy: string; updated_at: string }
export interface ActivityEvent { id: string; sender: "customer" | "agent"; body: string; created_at: string; conversation_id: string; customer_name: string }
export interface SettingsData {
  agent: Agent; brandId: string; webhookUrl: string; signatureHeader: string; signatureFormat: string;
  status: { database: boolean; aiConfigured: boolean; aiModel: string; aiHost: string; knowledgeEntries: number };
}
export interface WebhookSample { url: string; payload: string; signature: string }
