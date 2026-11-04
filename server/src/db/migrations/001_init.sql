-- Verdant & Co support platform: initial schema.

CREATE TABLE agents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  name          text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agents_email_key ON agents (lower(email));

CREATE TABLE customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    text NOT NULL,
  external_id text NOT NULL,            -- id from the chat system, e.g. cust_1042
  name        text NOT NULL,
  phone       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, external_id)
);

CREATE TABLE conversations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id        uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  last_message_at    timestamptz NOT NULL DEFAULT now(),
  agent_last_read_at timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
-- "Each customer has one open conversation" enforced by the database, not just by code.
CREATE UNIQUE INDEX conversations_one_open_per_customer
  ON conversations (customer_id) WHERE status = 'open';
CREATE INDEX conversations_last_message_idx ON conversations (last_message_at DESC);

CREATE TABLE webhook_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      text NOT NULL UNIQUE,   -- idempotency key (evt_... or web_...)
  source        text NOT NULL CHECK (source IN ('webhook', 'customer_view')),
  status        text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed')),
  error         text,
  received_at   timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz
);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender          text NOT NULL CHECK (sender IN ('customer', 'agent')),
  body            text NOT NULL CHECK (length(btrim(body)) > 0),
  external_id     text,                 -- chat-system message id (customer messages)
  event_id        text REFERENCES webhook_events(event_id),
  agent_id        uuid REFERENCES agents(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at);
CREATE UNIQUE INDEX messages_external_id_key ON messages (external_id) WHERE external_id IS NOT NULL;

CREATE TABLE ai_drafts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id     uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE, -- the customer message answered
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  status         text NOT NULL CHECK (status IN ('pending', 'used', 'superseded', 'failed')),
  body           text,
  needs_human    boolean NOT NULL DEFAULT false,
  model          text,
  error          text,
  reply_message_id uuid REFERENCES messages(id),   -- set when approved
  final_body     text,                              -- text actually sent (may be edited)
  created_at     timestamptz NOT NULL DEFAULT now(),
  used_at        timestamptz,
  CHECK (status <> 'pending' OR body IS NOT NULL)
);
-- Only one live suggestion per customer message.
CREATE UNIQUE INDEX ai_drafts_one_pending_per_message ON ai_drafts (message_id) WHERE status = 'pending';
CREATE INDEX ai_drafts_conversation_idx ON ai_drafts (conversation_id, created_at DESC);
