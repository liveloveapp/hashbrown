-- Install-runtime ("hello") link decisions, as threadplane 0007. The
-- installation_token_digest column and its index already exist from 0003.
create table growth_install_runtime_links (
  runtime_observation_id uuid primary key references growth_observations(id) on delete cascade,
  install_observation_id uuid references growth_observations(id) on delete cascade,
  contact_id uuid references growth_contacts(id) on delete set null,
  outcome text not null check (outcome in ('approved','ineligible','conflicted')),
  evaluated_at timestamptz not null
);
create index growth_install_runtime_contact on growth_install_runtime_links(contact_id)
  where contact_id is not null;

-- The report ledger is the digest's idempotency memory; deleting a digest job must not erase it.
create table growth_install_digest_reports (
  email_lookup_hmac text not null,
  email_key_version smallint not null check (email_key_version > 0),
  first_install_observation_id uuid not null references growth_observations(id) on delete cascade,
  digest_job_id uuid not null references growth_jobs(id),
  reported_at timestamptz not null,
  primary key (email_key_version, email_lookup_hmac)
);
create index growth_install_digest_reports_job on growth_install_digest_reports(digest_job_id);

-- The latest growth-score-policy result per contact. It orders the digest and
-- the funnel report and never authorizes a send.
create table growth_contact_scores (
  contact_id uuid primary key references growth_contacts(id),
  score integer not null check (score >= 0),
  tier text not null check (tier in ('low','medium','high','very_high')),
  policy_version text not null,
  reasons jsonb not null check (jsonb_typeof(reasons) = 'array'),
  computed_at timestamptz not null
);
