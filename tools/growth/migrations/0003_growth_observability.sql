CREATE TABLE growth_observation_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace text NOT NULL CHECK (namespace IN ('website_session','installation','development_browser')),
  external_id uuid NOT NULL,
  first_received_at timestamptz NOT NULL,
  last_received_at timestamptz NOT NULL,
  UNIQUE (namespace, external_id)
);
CREATE TABLE growth_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('website','install','runtime')),
  event_id uuid NOT NULL,
  subject_id uuid NOT NULL REFERENCES growth_observation_subjects(id) ON DELETE CASCADE,
  session_id uuid,
  kind text NOT NULL CHECK (length(kind) BETWEEN 1 AND 100),
  schema_version smallint NOT NULL CHECK (schema_version=1),
  collector_version text NOT NULL CHECK (length(collector_version) BETWEEN 1 AND 64),
  identity_scope text NOT NULL CHECK (identity_scope IN ('persistent','session','memory')),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  trust text NOT NULL DEFAULT 'client_reported' CHECK (trust='client_reported'),
  properties jsonb NOT NULL CHECK (jsonb_typeof(properties)='object'),
  public_digest text NOT NULL CHECK (length(public_digest)=64),
  identity_digest text CHECK (length(identity_digest)=64),
  identity_digest_key_version smallint CHECK (identity_digest_key_version>0),
  redacted_at timestamptz,
  UNIQUE(source,event_id),
  CHECK ((identity_digest IS NULL)=(identity_digest_key_version IS NULL))
);
CREATE INDEX growth_observations_subject_time ON growth_observations(subject_id,received_at,id);
CREATE INDEX growth_observations_source_time ON growth_observations(source,received_at,id);
CREATE TABLE growth_observation_identities (
  observation_id uuid PRIMARY KEY REFERENCES growth_observations(id) ON DELETE CASCADE,
  email_normalized text CHECK (length(email_normalized) BETWEEN 1 AND 320),
  git_display_name text CHECK (length(git_display_name) BETWEEN 1 AND 160),
  git_config_origin text CHECK (git_config_origin IN ('local','global','unknown')),
  repository_provider text CHECK (repository_provider IN ('github','gitlab','bitbucket')),
  repository_owner text CHECK (length(repository_owner) BETWEEN 1 AND 100),
  email_lookup_hmac text,
  email_key_version smallint CHECK (email_key_version>0),
  CHECK ((email_normalized IS NULL)=(email_lookup_hmac IS NULL)),
  CHECK ((email_normalized IS NULL)=(email_key_version IS NULL)),
  CHECK ((repository_provider IS NULL)=(repository_owner IS NULL))
);
CREATE INDEX growth_observation_identities_lookup ON growth_observation_identities(email_key_version,email_lookup_hmac);
CREATE INDEX growth_observation_identities_email ON growth_observation_identities(email_normalized);
CREATE TABLE growth_observation_redactions (
  selector_kind text NOT NULL CHECK (selector_kind IN ('subject','email')),
  selector_key text NOT NULL,
  key_version smallint NOT NULL,
  redacted_at timestamptz NOT NULL,
  PRIMARY KEY(selector_kind,selector_key,key_version),
  CHECK ((selector_kind='subject' AND key_version=0) OR (selector_kind='email' AND key_version>0))
);
CREATE TABLE growth_observation_work (
  observation_id uuid PRIMARY KEY REFERENCES growth_observations(id) ON DELETE CASCADE,
  generation bigint NOT NULL DEFAULT 1 CHECK (generation>0),
  projection_version text NOT NULL DEFAULT 'observation-facts-v1',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','leased','completed','failed')),
  available_at timestamptz NOT NULL,
  lease_token uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
  last_error_code text CHECK (length(last_error_code)<=80),
  updated_at timestamptz NOT NULL,
  CHECK ((status='leased' AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (status<>'leased' AND lease_token IS NULL AND lease_until IS NULL))
);
CREATE INDEX growth_observation_work_due ON growth_observation_work(available_at,observation_id) WHERE status IN ('pending','leased');
CREATE TABLE growth_observation_facts (
  observation_id uuid PRIMARY KEY REFERENCES growth_observations(id) ON DELETE CASCADE,
  generation bigint NOT NULL,
  projection_version text NOT NULL,
  projected_at timestamptz NOT NULL,
  active_day date NOT NULL,
  milestone_kind text CHECK (milestone_kind IN ('runtime.first_stream_completed','tool.first_call_executed','component.first_rendered')),
  source text NOT NULL CHECK (source IN ('website','install','runtime')),
  subject_id uuid NOT NULL REFERENCES growth_observation_subjects(id) ON DELETE CASCADE
);
CREATE TABLE growth_collection_budgets (
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  count bigint NOT NULL CHECK (count>0),
  PRIMARY KEY(bucket_key,window_start)
);
CREATE TABLE growth_observation_operations (
  operation_id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('replay','redact')),
  requested_at timestamptz NOT NULL,
  selection_digest text NOT NULL,
  selected_count integer NOT NULL CHECK (selected_count>=0),
  completed_at timestamptz NOT NULL
);
CREATE INDEX growth_observation_facts_subject_milestone ON growth_observation_facts(subject_id,milestone_kind);
alter table growth_observations add column installation_token_digest text;
alter table growth_observations add constraint growth_installation_token_digest_format
  check (installation_token_digest is null or installation_token_digest ~ '^[0-9a-f]{64}$');
create index growth_observation_installation_token on growth_observations(installation_token_digest,source)
  where installation_token_digest is not null;
