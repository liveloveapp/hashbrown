/**
 * The machine-readable contract for hashbrown.dev's PostHog events: which
 * properties each event must carry, may carry, and may be broken down by.
 * Committed insights are checked against it in tests, and `quality:live`
 * checks sampled production events against it. `docs/growth/taxonomy.md` is
 * the human-readable counterpart.
 */

/**
 * Properties no event may ever carry: content, identifiers and endpoints that
 * could leak a prompt, a conversation or a private address.
 */
export const TELEMETRY_FORBIDDEN_PROPERTIES = [
  'prompt',
  'messages',
  'threadId',
  'runId',
  'apiUrl',
  'url',
  'error',
  'schema',
  'toolArgs',
  'componentProps',
] as const;

/** What one event must, may, and may be broken down by. */
export interface TelemetryEventContract {
  /** Properties that must be present and non-empty. */
  readonly requiredProperties: readonly string[];
  /** Every property the event may carry (includes the required ones). */
  readonly allowedProperties: readonly string[];
  /** Properties insights may break the event down by. */
  readonly allowedBreakdowns: readonly string[];
}

const UNSTUCK_FORM: TelemetryEventContract = {
  requiredProperties: [],
  allowedProperties: ['surface', 'source_page', 'error_reason'],
  allowedBreakdowns: ['surface'],
};

/**
 * The contract, keyed by event name. The `marketing:unstuck_form_*` events are
 * declared ahead of the form that fires them.
 */
export const TELEMETRY_EVENT_CONTRACT: Readonly<
  Record<string, TelemetryEventContract>
> = {
  $pageview: {
    requiredProperties: [],
    allowedProperties: ['$pathname', 'title'],
    allowedBreakdowns: ['$pathname'],
  },
  'marketing:cta_click': {
    requiredProperties: ['cta_id', 'surface'],
    allowedProperties: [
      'cta_id',
      'surface',
      'destination_url',
      'source_section',
      'source_page',
    ],
    allowedBreakdowns: ['cta_id', 'surface', 'source_page'],
  },
  'marketing:threadplane_cta_click': {
    requiredProperties: ['surface'],
    allowedProperties: ['surface', 'destination_url', 'source_page'],
    allowedBreakdowns: ['surface', 'source_page'],
  },
  'marketing:engaged_time': {
    requiredProperties: ['engaged_seconds'],
    allowedProperties: ['engaged_seconds', 'source_page'],
    allowedBreakdowns: ['engaged_seconds'],
  },
  'marketing:ai_crawler_visit': {
    requiredProperties: ['ai_crawler'],
    allowedProperties: ['ai_crawler', 'source_page', 'user_agent'],
    allowedBreakdowns: ['ai_crawler'],
  },
  'marketing:ai_referral_visit': {
    requiredProperties: ['ai_source'],
    allowedProperties: ['ai_source', 'source_page'],
    allowedBreakdowns: ['ai_source'],
  },
  'marketing:pre_analytics_exit': {
    requiredProperties: [],
    allowedProperties: [
      'elapsed_ms',
      'trigger',
      'source_page',
      'referrer_host',
      'viewport_width',
      'effective_type',
    ],
    allowedBreakdowns: ['trigger'],
  },
  'docs:page_viewed': {
    requiredProperties: ['pathname', 'framework'],
    allowedProperties: ['pathname', 'framework', 'source_page'],
    allowedBreakdowns: ['framework', 'pathname'],
  },
  'docs:code_copied': {
    requiredProperties: ['pathname', 'framework', 'language'],
    allowedProperties: ['pathname', 'framework', 'language', 'source_page'],
    allowedBreakdowns: ['framework', 'language'],
  },
  'marketing:unstuck_form_submit': UNSTUCK_FORM,
  'marketing:unstuck_form_success': UNSTUCK_FORM,
  'marketing:unstuck_form_fail': UNSTUCK_FORM,
};

/**
 * Shape of an event name the website sends: a PostHog built-in (`$name`) or
 * `namespace:snake_case` in the `marketing` or `docs` namespace.
 */
export const EVENT_NAME_PATTERN = /^(?:\$[a-z_]+|(?:marketing|docs):[a-z_]+)$/;

/**
 * Event names written in backticks in a markdown document, such as
 * `docs/growth/taxonomy.md`.
 *
 * @param markdown - The document text.
 * @returns Every backticked string that is a valid event name.
 */
export function documentedEvents(markdown: string): Set<string> {
  const documented = new Set<string>();
  for (const match of markdown.matchAll(/`([^`\s]+)`/g)) {
    if (EVENT_NAME_PATTERN.test(match[1])) documented.add(match[1]);
  }
  return documented;
}
