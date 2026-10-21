import type { SqlExecutor } from '../database.ts';
import { readContactControlState } from '../contacts.ts';
import { ObservationError, uuid } from './contracts.ts';

const LIMIT = 50;

/** A UTC day column counts when its midnight falls in the window `[$1, $2)`. */
function dayInWindow(column: string): string {
  return `(${column}::timestamp at time zone 'utc')>=$1 and (${column}::timestamp at time zone 'utc')<$2`;
}

function reportSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const url = new URL(value);
    // Encoded paths can hide identity through repeated decoding. Omit them
    // conservatively; query and fragment are never useful source provenance.
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      /[%@]/u.test(url.pathname)
    )
      return null;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

/** Reduces every URL in a string to its safe source form and redacts emails. */
function scrubText(value: string): string {
  return value
    .replace(
      /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]*/giu,
      (match) => reportSourceUrl(match) ?? '[redacted]',
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[redacted]');
}

function scrubRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      typeof value === 'string' ? scrubText(value) : value,
    ]),
  );
}

/** Day-restricted counts over `growth_observation_runtime_funnel_v1`. */
export interface RuntimeFunnelCounts {
  started: number;
  streamed: number;
  tool_used: number;
  component_rendered: number;
  activated: number;
  stalled_after_hello_world: number;
}

/** Day-restricted counts over `growth_observation_install_funnel_v1`. */
export interface InstallFunnelCounts {
  installed: number;
  reached_runtime: number;
  stalled_before_first_request: number;
}

/** Non-CI, non-redacted installs of one package in the window. */
export interface PackageInstallCounts {
  package_name: string;
  installs: number;
  subjects: number;
}

/** One row of `growth_observation_funnel_daily_v1`; `day` is `YYYY-MM-DD` UTC. */
export interface FunnelDay {
  day: string;
  installed: number;
  started: number;
  streamed: number;
  tool_used: number;
  component_rendered: number;
  activated: number;
  stalled_before_first_request: number;
  stalled_after_hello_world: number;
}

/** What {@link readGrowthFunnel} returns. */
export interface GrowthFunnelReport {
  from: string;
  to: string;
  independentSignals: {
    unit: string;
    window: string;
    rows: Record<string, unknown>[];
  };
  observationProcessing: { unit: string; rows: Record<string, unknown>[] };
  runtimeFunnel: { unit: string; window: string } & RuntimeFunnelCounts;
  installFunnel: { unit: string; window: string } & InstallFunnelCounts;
  installedByPackage: {
    unit: string;
    window: string;
    rows: PackageInstallCounts[];
  };
  daily: FunnelDay[];
  unavailable: string[];
}

/**
 * Reports the growth funnel for a window. Independent signals are not a
 * conversion denominator. The runtime funnel counts development-browser
 * subjects whose `started_day` falls in the window, the install funnel counts
 * token-bearing (`@hashbrownai/core`) non-CI installs whose `installed_day`
 * falls in it, `installedByPackage` counts every package's non-CI installs by
 * the same day, and `daily` is the daily view's rows for days in it; a UTC day
 * falls in the window when its midnight does. Activation links, forms, and the
 * campaign cohort are not reported yet.
 *
 * @param db - The growth database executor.
 * @param input - The window `[from, to)`; `to` after `from`, at most 31 days.
 * @returns The report sections.
 * @throws ObservationError `invalid_payload` for a bad window.
 */
export async function readGrowthFunnel(
  db: SqlExecutor,
  input: { from: Date; to: Date },
): Promise<GrowthFunnelReport> {
  if (
    !Number.isFinite(input.from.getTime()) ||
    !Number.isFinite(input.to.getTime()) ||
    input.to <= input.from ||
    input.to.getTime() - input.from.getTime() > 31 * 86400000
  )
    throw new ObservationError('invalid_payload');
  const parameters = [input.from, input.to];
  const signals = await db.execute(
    `/* growth:observation-read-independent-signals */ select source,kind,case when source='install' then properties->>'environment' end as environment,
    count(*) as observations,count(distinct subject_id) as subjects
    from growth_observations where received_at >= $1 and received_at < $2
    group by source,kind,case when source='install' then properties->>'environment' end order by source,kind,environment`,
    parameters,
  );
  const processing = await db.execute(
    `/* growth:observation-read-processing-states */ select coalesce(w.status,'missing') as status,count(*) as observations
    from growth_observations o left join growth_observation_work w on w.observation_id=o.id
    where o.received_at >= $1 and o.received_at < $2 group by w.status order by status`,
    parameters,
  );
  const runtime = await db.execute<
    Record<string, unknown> & RuntimeFunnelCounts
  >(
    `/* growth:observation-read-runtime-funnel */ select count(*)::int as started,
    count(*) filter(where streamed_day is not null)::int as streamed,
    count(*) filter(where tool_day is not null)::int as tool_used,
    count(*) filter(where component_day is not null)::int as component_rendered,
    count(*) filter(where activated)::int as activated,
    count(*) filter(where stalled_after_hello_world)::int as stalled_after_hello_world
    from growth_observation_runtime_funnel_v1 where ${dayInWindow('started_day')}`,
    parameters,
  );
  const install = await db.execute<
    Record<string, unknown> & InstallFunnelCounts
  >(
    `/* growth:observation-read-install-funnel */ select count(*)::int as installed,
    count(*) filter(where first_runtime_day is not null)::int as reached_runtime,
    count(*) filter(where stalled_before_first_request)::int as stalled_before_first_request
    from growth_observation_install_funnel_v1 where ${dayInWindow('installed_day')}`,
    parameters,
  );
  const installedDay =
    "(least(occurred_at,received_at) at time zone 'utc')::date";
  const byPackage = await db.execute<
    Record<string, unknown> & PackageInstallCounts
  >(
    `/* growth:observation-read-installs-by-package */ select properties->>'packageName' as package_name,
    count(*)::int as installs,count(distinct subject_id)::int as subjects
    from growth_observations where source='install' and kind='package.installed'
    and properties->>'environment' is distinct from 'ci' and redacted_at is null
    and ${dayInWindow(installedDay)}
    group by properties->>'packageName' order by package_name`,
    parameters,
  );
  const daily = await db.execute<Record<string, unknown> & FunnelDay>(
    `/* growth:observation-read-funnel-daily */ select to_char(day,'YYYY-MM-DD') as day,installed::int,started::int,streamed::int,tool_used::int,
    component_rendered::int,activated::int,stalled_before_first_request::int,stalled_after_hello_world::int
    from growth_observation_funnel_daily_v1 where ${dayInWindow('day')} order by day`,
    parameters,
  );
  const dayWindow = 'UTC days whose midnight is in [from,to)';
  return {
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    independentSignals: {
      unit: 'observations and distinct subjects per group; subjects may appear in multiple groups',
      window: 'received_at [from,to)',
      rows: signals.rows,
    },
    observationProcessing: {
      unit: 'observations received in the window, current processing state',
      rows: processing.rows,
    },
    runtimeFunnel: {
      unit: 'distinct development-browser subjects by session start day; activated means all three milestones within 30 days of the start day',
      window: `started_day in ${dayWindow}`,
      ...runtime.rows[0],
    },
    installFunnel: {
      unit: 'token-bearing (@hashbrownai/core) non-CI install observations by install day; reached_runtime means a runtime observation shares the installation token',
      window: `installed_day in ${dayWindow}`,
      ...install.rows[0],
    },
    installedByPackage: {
      unit: 'non-CI, non-redacted package.installed observations by package, all packages',
      window: `installed_day in ${dayWindow}`,
      rows: byPackage.rows,
    },
    daily: daily.rows,
    unavailable: [
      'Anonymous website-to-install attribution is not persisted.',
      'Ingress rejection details require service logs.',
      'Provider outcomes not yet persisted are unavailable.',
      'Install-to-runtime activation links are not reported yet.',
      'Form submissions are not reported yet.',
      'The linked contact campaign cohort is not reported yet.',
    ],
  };
}

/** A contact's bounded operator journey; a deleted contact has only `contact`. */
export type ContactJourney =
  | { contact: { id: string; authorization: 'deleted' } }
  | {
      contact: {
        id: string;
        authorization: 'approved' | 'stopped' | 'unapproved';
      };
      observations: Record<string, unknown>[];
      jobs: Record<string, unknown>[];
      activity: Record<string, unknown>[];
    };

/**
 * Reads a bounded, identity-free operator view of one contact: its current
 * authorization, the latest 50 observations linked by email (the contact's
 * current lookup HMAC or any `contact.lookup_alias_added` alias), jobs, and
 * activity. Never selects job payloads, activity data, or identity. URLs in
 * any text keep only an https origin and plain path (query and fragment
 * dropped; unsafe or encoded ones become `[redacted]`), and emails are
 * redacted. A deleted contact reports only its authorization.
 *
 * @param db - The growth database executor.
 * @param contactId - The contact id.
 * @returns The journey, or `null` when the contact does not exist.
 * @throws ObservationError `invalid_payload` for a bad id.
 */
export async function readContactJourney(
  db: SqlExecutor,
  contactId: string,
): Promise<ContactJourney | null> {
  uuid(contactId);
  const contact = await db.execute(
    '/* growth:observation-read-journey-contact */ select id from growth_contacts where id=$1',
    [contactId],
  );
  if (!contact.rows[0]) return null;
  const control = await readContactControlState(db, contactId);
  if (control.authorization === 'deleted')
    return { contact: { id: contactId, authorization: 'deleted' } };
  const observations = await db.execute(
    `/* growth:observation-read-journey-observations */ select o.id,o.subject_id,o.source,o.kind,o.occurred_at,o.received_at,o.trust,
    o.redacted_at is not null as redacted,w.status as processing_status,w.last_error_code
    from growth_observations o join growth_observation_identities i on i.observation_id=o.id
    left join growth_observation_work w on w.observation_id=o.id
    where (i.email_key_version,i.email_lookup_hmac) in (
      select email_hmac_key_version,email_lookup_hmac from growth_contacts where id=$1
      union all select (data->>'key_version')::smallint,data->>'digest' from growth_activity where contact_id=$1 and kind='contact.lookup_alias_added')
    order by o.received_at desc,o.id desc limit $2`,
    [contactId, LIMIT],
  );
  const jobs = await db.execute(
    `/* growth:observation-read-journey-jobs */ select id,kind,status,delivery_status,available_at,created_at
    from growth_jobs where contact_id=$1 order by created_at desc,id desc limit $2`,
    [contactId, LIMIT],
  );
  const activity = await db.execute(
    `/* growth:observation-read-journey-activity */ select id,kind,occurred_at from growth_activity where contact_id=$1
    order by occurred_at desc,id desc limit $2`,
    [contactId, LIMIT],
  );
  return {
    contact: { id: contactId, authorization: control.authorization },
    observations: observations.rows.map(scrubRow),
    jobs: jobs.rows.map(scrubRow),
    activity: activity.rows.map(scrubRow),
  };
}
