-- Persist only identifiers and digests, never rendered email content.
CREATE TABLE growth_provider_attempts (
  idempotency_key text PRIMARY KEY,
  first_attempted_at timestamptz NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  provider_email_id text
);
ALTER TABLE growth_reply_receipts ADD COLUMN forward_provider_id text;
