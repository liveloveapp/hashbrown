-- The Get unstuck form stopped recording the agreement text, its versions and
-- the framework on 2026-10-25. This removes those keys from stored activity.
-- Applied to production by hand. The ?| guard makes a second run a no-op.
UPDATE growth_activity
SET data = data - 'notice_text' - 'notice_version' - 'policy_version' - 'framework'
WHERE kind = 'contact.form_submission'
  AND data ?| array['notice_text', 'notice_version', 'policy_version', 'framework'];

UPDATE growth_activity
SET data = data - 'policy_version'
WHERE kind = 'form.outreach_approved'
  AND data ? 'policy_version';
