-- The marketing post queue. One week holds the posts drafted for it; a post
-- publishes only when its own row is approved. Channel tokens live encrypted
-- in marketing_channel_credentials, never in env.
CREATE TABLE marketing_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'done')),
  research_brief jsonb NOT NULL DEFAULT '{}',
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE marketing_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES marketing_weeks(id) ON DELETE CASCADE,
  channel text NOT NULL
    CHECK (channel IN ('x', 'linkedin', 'blog', 'devto')),
  kind text NOT NULL
    CHECK (kind IN ('release', 'qa', 'topical', 'guide', 'take', 'blog_promo', 'blog')),
  scheduled_at timestamptz NOT NULL,
  draft jsonb NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]',
  depends_on uuid REFERENCES marketing_posts(id),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'held', 'publishing', 'published', 'failed', 'cancelled')),
  attempts smallint NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  lease_until timestamptz,
  external_id text,
  external_url text,
  published_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX marketing_posts_due
  ON marketing_posts (scheduled_at)
  WHERE status IN ('approved', 'publishing');

CREATE TABLE marketing_channel_credentials (
  channel text PRIMARY KEY CHECK (channel IN ('x', 'linkedin')),
  ciphertext text NOT NULL,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER marketing_weeks_set_updated_at
BEFORE UPDATE ON marketing_weeks
FOR EACH ROW EXECUTE FUNCTION growth_set_updated_at();

CREATE TRIGGER marketing_posts_set_updated_at
BEFORE UPDATE ON marketing_posts
FOR EACH ROW EXECUTE FUNCTION growth_set_updated_at();

CREATE TRIGGER marketing_channel_credentials_set_updated_at
BEFORE UPDATE ON marketing_channel_credentials
FOR EACH ROW EXECUTE FUNCTION growth_set_updated_at();
