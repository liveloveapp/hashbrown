CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE growth_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized citext UNIQUE,
  email_lookup_hmac text NOT NULL UNIQUE,
  email_hmac_key_version smallint NOT NULL,
  display_name text,
  company_name text,
  company_domain text,
  outreach_approved_at timestamptz,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE growth_projects (
  id uuid PRIMARY KEY,
  contact_id uuid REFERENCES growth_contacts(id),
  posthog_distinct_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX growth_projects_contact
  ON growth_projects (contact_id)
  WHERE contact_id IS NOT NULL;

CREATE TABLE growth_activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key text NOT NULL UNIQUE,
  contact_id uuid REFERENCES growth_contacts(id),
  project_id uuid REFERENCES growth_projects(id),
  kind text NOT NULL,
  occurred_at timestamptz NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX growth_activity_contact_time
  ON growth_activity (contact_id, occurred_at DESC);
CREATE INDEX growth_activity_project_time
  ON growth_activity (project_id, occurred_at DESC);

CREATE TABLE growth_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL
    CONSTRAINT growth_jobs_kind_check
    CHECK (kind IN ('fulfill', 'notify', 'send_step', 'digest', 'reply_reconcile')),
  contact_id uuid REFERENCES growth_contacts(id),
  project_id uuid REFERENCES growth_projects(id),
  status text NOT NULL
    CONSTRAINT growth_jobs_status_check
    CHECK (status IN ('pending', 'leased', 'completed', 'failed', 'cancelled')),
  available_at timestamptz NOT NULL,
  lease_until timestamptz,
  lease_token uuid,
  attempts integer NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_email_id text,
  rfc_message_id text,
  gmail_seed_message_id text,
  delivery_status text NOT NULL DEFAULT 'not_submitted'
    CONSTRAINT growth_jobs_delivery_status_check
    CHECK (delivery_status IN (
      'not_submitted', 'submitted', 'delivered', 'bounced',
      'complained', 'suppressed', 'failed', 'unknown'
    )),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX growth_jobs_due
  ON growth_jobs (available_at, id)
  WHERE status = 'pending';
CREATE INDEX growth_jobs_expired_lease
  ON growth_jobs (lease_until, id)
  WHERE status = 'leased';
CREATE INDEX growth_jobs_contact
  ON growth_jobs (contact_id, id)
  WHERE contact_id IS NOT NULL;
CREATE INDEX growth_jobs_campaign_predecessor
  ON growth_jobs (
    contact_id,
    (payload->>'campaign_version'),
    (payload->>'step')
  )
  WHERE kind = 'send_step';
CREATE UNIQUE INDEX growth_jobs_provider_email
  ON growth_jobs (provider_email_id)
  WHERE provider_email_id IS NOT NULL;
CREATE UNIQUE INDEX growth_jobs_rfc_message
  ON growth_jobs (rfc_message_id)
  WHERE rfc_message_id IS NOT NULL;
CREATE UNIQUE INDEX growth_jobs_gmail_seed
  ON growth_jobs (gmail_seed_message_id)
  WHERE gmail_seed_message_id IS NOT NULL;

CREATE TABLE growth_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES growth_jobs(id),
  contact_id uuid REFERENCES growth_contacts(id),
  project_id uuid REFERENCES growth_projects(id),
  kind text NOT NULL,
  schema_version integer NOT NULL,
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION growth_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER growth_contacts_set_updated_at
BEFORE UPDATE ON growth_contacts
FOR EACH ROW EXECUTE FUNCTION growth_set_updated_at();

CREATE TRIGGER growth_projects_set_updated_at
BEFORE UPDATE ON growth_projects
FOR EACH ROW EXECUTE FUNCTION growth_set_updated_at();

CREATE TRIGGER growth_jobs_set_updated_at
BEFORE UPDATE ON growth_jobs
FOR EACH ROW EXECUTE FUNCTION growth_set_updated_at();
