-- Drops the schema the retired Gmail reply path used (removed from code in #744).
-- Production held no reply_reconcile jobs and no Gmail seed ids when this ran.
DROP INDEX growth_jobs_gmail_seed;

ALTER TABLE growth_jobs DROP COLUMN gmail_seed_message_id;

ALTER TABLE growth_jobs
  DROP CONSTRAINT growth_jobs_kind_check,
  ADD CONSTRAINT growth_jobs_kind_check
    CHECK (kind IN ('fulfill', 'notify', 'send_step', 'digest'));
