-- Retain scan progress across bounded invocations; coverage advances only on completion.
ALTER TABLE growth_reply_mailboxes
  ADD COLUMN scan_cursor text,
  ADD COLUMN scan_started_at timestamptz,
  ADD COLUMN scan_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN scan_head_id text,
  ADD COLUMN covered_head_id text;
