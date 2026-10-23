-- Only bounded health codes and immutable timestamps are persisted, never email content.
CREATE TABLE growth_health_alert_state (
  key text NOT NULL,
  environment text NOT NULL CHECK (environment = 'production'),
  fingerprint text NOT NULL,
  PRIMARY KEY (key, environment)
);
CREATE TABLE growth_health_alert_outbox (
  id uuid PRIMARY KEY,
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  environment text NOT NULL CHECK (environment = 'production'),
  codes jsonb NOT NULL CHECK (jsonb_typeof(codes) = 'array'),
  created_at timestamptz NOT NULL,
  provider_email_id text,
  failure_code text CHECK (failure_code IN ('idempotency_expired', 'payload_conflict'))
);
CREATE INDEX growth_health_alert_pending ON growth_health_alert_outbox(environment, sequence)
  WHERE provider_email_id IS NULL AND failure_code IS NULL;
