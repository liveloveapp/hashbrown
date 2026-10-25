-- Serves countUnboundProviderMessages, which runs every lifecycle tick: completed
-- sends with a provider id but no RFC Message-ID yet, filtered by age.
CREATE INDEX growth_jobs_unbound_provider_message
  ON growth_jobs (updated_at)
  WHERE kind IN ('fulfill', 'send_step')
    AND status = 'completed'
    AND provider_email_id IS NOT NULL
    AND rfc_message_id IS NULL;
