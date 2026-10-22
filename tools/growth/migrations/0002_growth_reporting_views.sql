CREATE VIEW growth_contact_overview_v1 AS
WITH project_summary AS (
  SELECT
    contact_id,
    count(*) AS project_count
  FROM growth_projects
  WHERE contact_id IS NOT NULL
  GROUP BY contact_id
),
activity_summary AS (
  SELECT
    contact_id,
    count(*) AS activity_count,
    max(occurred_at) AS last_activity_at
  FROM growth_activity
  WHERE contact_id IS NOT NULL
    AND kind <> 'contact.lookup_alias_added'
  GROUP BY contact_id
),
job_summary AS (
  SELECT
    contact_id,
    count(*) FILTER (WHERE status = 'pending') AS pending_job_count,
    count(*) FILTER (WHERE delivery_status = 'delivered') AS delivered_job_count
  FROM growth_jobs
  WHERE contact_id IS NOT NULL
  GROUP BY contact_id
)
SELECT
  contact.id AS contact_id,
  contact.email_normalized,
  contact.display_name,
  contact.company_name,
  contact.company_domain,
  contact.source,
  contact.outreach_approved_at,
  contact.created_at,
  contact.updated_at,
  contact.deleted_at,
  coalesce(project_summary.project_count, 0) AS project_count,
  coalesce(activity_summary.activity_count, 0) AS activity_count,
  activity_summary.last_activity_at,
  coalesce(job_summary.pending_job_count, 0) AS pending_job_count,
  coalesce(job_summary.delivered_job_count, 0) AS delivered_job_count
FROM growth_contacts AS contact
LEFT JOIN project_summary ON project_summary.contact_id = contact.id
LEFT JOIN activity_summary ON activity_summary.contact_id = contact.id
LEFT JOIN job_summary ON job_summary.contact_id = contact.id;

CREATE VIEW growth_funnel_daily_v1 AS
WITH days AS (
  SELECT created_at::date AS day FROM growth_contacts
  UNION
  SELECT outreach_approved_at::date AS day FROM growth_contacts
  WHERE outreach_approved_at IS NOT NULL
  UNION
  SELECT created_at::date AS day FROM growth_projects
  UNION
  SELECT occurred_at::date AS day FROM growth_activity
  WHERE kind <> 'contact.lookup_alias_added'
)
SELECT
  days.day,
  (SELECT count(*) FROM growth_contacts WHERE created_at::date = days.day) AS contacts_created,
  (SELECT count(*) FROM growth_contacts WHERE outreach_approved_at::date = days.day) AS contacts_approved,
  (SELECT count(*) FROM growth_projects WHERE created_at::date = days.day) AS projects_created,
  (SELECT count(*) FROM growth_activity
   WHERE occurred_at::date = days.day
     AND kind <> 'contact.lookup_alias_added') AS activities_recorded
FROM days;

CREATE VIEW growth_campaign_performance_v1 AS
SELECT
  kind,
  count(*) AS job_count,
  count(*) FILTER (WHERE status = 'completed') AS completed_count,
  count(*) FILTER (WHERE delivery_status = 'submitted') AS submitted_count,
  count(*) FILTER (WHERE delivery_status = 'delivered') AS delivered_count,
  count(*) FILTER (WHERE delivery_status = 'bounced') AS bounced_count,
  count(*) FILTER (WHERE delivery_status = 'complained') AS complained_count,
  count(*) FILTER (WHERE delivery_status = 'suppressed') AS suppressed_count,
  count(*) FILTER (WHERE delivery_status = 'failed') AS delivery_failed_count,
  count(*) FILTER (WHERE delivery_status = 'unknown') AS delivery_unknown_count
FROM growth_jobs
GROUP BY kind;

CREATE VIEW growth_job_health_v1 AS
SELECT
  kind,
  status,
  delivery_status,
  count(*) AS job_count,
  count(*) FILTER (WHERE status = 'pending' AND available_at <= now()) AS due_count,
  count(*) FILTER (WHERE status = 'leased' AND lease_until < now()) AS expired_lease_count,
  max(attempts) AS max_attempts,
  min(available_at) FILTER (WHERE status = 'pending') AS oldest_pending_at
FROM growth_jobs
GROUP BY kind, status, delivery_status;
