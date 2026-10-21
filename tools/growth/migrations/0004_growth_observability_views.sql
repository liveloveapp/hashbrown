CREATE VIEW growth_observation_source_health_v1 AS
SELECT source, kind, collector_version,
  CASE WHEN source='install' THEN properties->>'environment' END AS environment,
  count(*) AS observation_count,
  count(DISTINCT subject_id) AS subject_count,
  count(DISTINCT (subject_id,session_id)) FILTER (WHERE session_id IS NOT NULL) AS session_count,
  max(received_at) AS last_received_at
FROM growth_observations
GROUP BY source, kind, collector_version, CASE WHEN source='install' THEN properties->>'environment' END;

CREATE VIEW growth_observation_subject_overview_v1 AS
SELECT s.id AS subject_id,s.namespace,s.first_received_at,s.last_received_at,
  count(o.id) AS observation_count,
  count(o.id) FILTER (WHERE f.observation_id IS NULL) AS unprojected_count,
  count(DISTINCT o.session_id) AS session_count,
  count(DISTINCT f.active_day) AS active_days,
  count(DISTINCT (f.milestone_kind,o.properties->>'integration')) FILTER (WHERE f.milestone_kind IS NOT NULL) AS attained_milestone_count
FROM growth_observation_subjects s
LEFT JOIN growth_observations o ON o.subject_id=s.id
LEFT JOIN growth_observation_facts f ON f.observation_id=o.id
GROUP BY s.id;

CREATE VIEW growth_observation_work_health_v1 AS
SELECT status,projection_version,count(*) AS work_count,
  count(*) FILTER (WHERE status='pending' AND available_at<=now()) AS due_count,
  count(*) FILTER (WHERE status='leased' AND lease_until<=now()) AS expired_lease_count,
  min(o.received_at) FILTER (WHERE status<>'completed') AS oldest_unprocessed_receipt,
  max(attempts) AS maximum_attempts
FROM growth_observation_work w JOIN growth_observations o ON o.id=w.observation_id
GROUP BY status,projection_version;

CREATE VIEW growth_observation_runtime_funnel_v1 AS
WITH subject_days AS (
  SELECT
    s.id AS subject_id,
    min(f.active_day) FILTER (WHERE o.kind = 'runtime.session_started') AS started_day,
    min(f.active_day) FILTER (WHERE f.milestone_kind = 'runtime.first_stream_completed') AS streamed_day,
    min(f.active_day) FILTER (WHERE f.milestone_kind = 'tool.first_call_executed') AS tool_day,
    min(f.active_day) FILTER (WHERE f.milestone_kind = 'component.first_rendered') AS component_day
  FROM growth_observation_subjects s
  LEFT JOIN (
    growth_observation_facts f
    JOIN growth_observations o
      ON o.id = f.observation_id AND o.redacted_at IS NULL
  ) ON f.subject_id = s.id
  WHERE s.namespace = 'development_browser'
  GROUP BY s.id
)
SELECT
  subject_id,
  started_day,
  streamed_day,
  tool_day,
  component_day,
  coalesce(
    streamed_day <= started_day + 30
      AND tool_day <= started_day + 30
      AND component_day <= started_day + 30,
    false
  ) AS activated,
  (
    streamed_day IS NOT NULL
      AND (tool_day IS NULL OR tool_day > streamed_day + 7)
      AND (component_day IS NULL OR component_day > streamed_day + 7)
      AND (now() AT TIME ZONE 'utc')::date > streamed_day + 7
  ) AS stalled_after_hello_world
FROM subject_days;

CREATE VIEW growth_observation_install_funnel_v1 AS
WITH installs AS (
  SELECT
    i.id AS observation_id,
    i.subject_id,
    i.properties->>'packageName' AS package_name,
    (least(i.occurred_at, i.received_at) AT TIME ZONE 'utc')::date AS installed_day,
    i.installation_token_digest
  FROM growth_observations i
  WHERE i.source = 'install'
    AND i.kind = 'package.installed'
    AND i.properties->>'environment' IS DISTINCT FROM 'ci'
    AND i.redacted_at IS NULL
),
reached AS (
  SELECT
    installs.observation_id,
    installs.subject_id,
    installs.package_name,
    installs.installed_day,
    (
      SELECT min((least(r.occurred_at, r.received_at) AT TIME ZONE 'utc')::date)
      FROM growth_observations r
      WHERE r.source = 'runtime'
        AND r.installation_token_digest = installs.installation_token_digest
        AND r.redacted_at IS NULL
    ) AS first_runtime_day
  FROM installs
)
SELECT
  observation_id,
  subject_id,
  package_name,
  installed_day,
  first_runtime_day,
  (
    (first_runtime_day IS NULL OR first_runtime_day > installed_day + 3)
      AND (now() AT TIME ZONE 'utc')::date > installed_day + 3
  ) AS stalled_before_first_request
FROM reached;

CREATE VIEW growth_observation_funnel_daily_v1 AS
WITH events AS (
  SELECT installed_day AS day, 'installed' AS metric
  FROM growth_observation_install_funnel_v1
  UNION ALL
  SELECT started_day, 'started' FROM growth_observation_runtime_funnel_v1
  UNION ALL
  SELECT streamed_day, 'streamed' FROM growth_observation_runtime_funnel_v1
  UNION ALL
  SELECT tool_day, 'tool_used' FROM growth_observation_runtime_funnel_v1
  UNION ALL
  SELECT component_day, 'component_rendered' FROM growth_observation_runtime_funnel_v1
  UNION ALL
  SELECT greatest(streamed_day, tool_day, component_day), 'activated'
  FROM growth_observation_runtime_funnel_v1
  WHERE activated
  UNION ALL
  SELECT installed_day + 3, 'stalled_before_first_request'
  FROM growth_observation_install_funnel_v1
  WHERE stalled_before_first_request
  UNION ALL
  SELECT streamed_day + 7, 'stalled_after_hello_world'
  FROM growth_observation_runtime_funnel_v1
  WHERE stalled_after_hello_world
)
SELECT
  day,
  count(*) FILTER (WHERE metric = 'installed') AS installed,
  count(*) FILTER (WHERE metric = 'started') AS started,
  count(*) FILTER (WHERE metric = 'streamed') AS streamed,
  count(*) FILTER (WHERE metric = 'tool_used') AS tool_used,
  count(*) FILTER (WHERE metric = 'component_rendered') AS component_rendered,
  count(*) FILTER (WHERE metric = 'activated') AS activated,
  count(*) FILTER (WHERE metric = 'stalled_before_first_request') AS stalled_before_first_request,
  count(*) FILTER (WHERE metric = 'stalled_after_hello_world') AS stalled_after_hello_world
FROM events
WHERE day IS NOT NULL
GROUP BY day;
