-- Pilot state is opt-in. No DNS or provider configuration is performed here.
CREATE TABLE growth_reply_mailboxes (
  address text PRIMARY KEY CHECK (address = 'brian@replies.hashbrown.dev'),
  enabled boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL,
  recovery_id uuid,
  healthy_through timestamptz,
  CHECK (healthy_through IS NULL OR healthy_through >= started_at)
);

CREATE TABLE growth_reply_receipts (
  id text PRIMARY KEY,
  recipient text NOT NULL REFERENCES growth_reply_mailboxes(address),
  received_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'stopped', 'ignored')),
  contact_id uuid REFERENCES growth_contacts(id),
  rfc_message_id text,
  reference_ids jsonb,
  attempts integer NOT NULL DEFAULT 0,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX growth_reply_receipts_pending
  ON growth_reply_receipts(recipient, created_at, id) WHERE status = 'pending';
CREATE UNIQUE INDEX growth_reply_receipts_rfc
  ON growth_reply_receipts(recipient, rfc_message_id)
  WHERE rfc_message_id IS NOT NULL;
