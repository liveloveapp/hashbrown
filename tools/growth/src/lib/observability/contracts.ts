import { normalizeEmail } from '../crypto.ts';

/** Collection sources served by the intake endpoints. */
export const COLLECTION_SOURCES = ['website', 'install', 'runtime'] as const;
/** One of the collection sources. */
export type CollectionSource = (typeof COLLECTION_SOURCES)[number];
/** A collection source or the form source. */
export type ObservationSource = CollectionSource | 'form';
/** Subject id namespace, fixed per source. */
export type SubjectNamespace =
  'website_session' | 'installation' | 'development_browser';
/** How long a subject id persists on the client. */
export type IdentityScope = 'persistent' | 'session' | 'memory';
/** Optional install-time developer identity (never trusted). */
export interface ObservationIdentity {
  gitDisplayName?: string;
  gitEmail?: string;
  gitConfigOrigin?: 'local' | 'global' | 'unknown';
  repositoryProvider?: 'github' | 'gitlab' | 'bitbucket';
  repositoryOwner?: string;
}
/** One validated collection event. */
export interface CollectionEventV1 {
  eventId: string;
  kind: string;
  occurredAt: string;
  collectorVersion: string;
  subject: { id: string; namespace: SubjectNamespace; scope: IdentityScope };
  sessionId?: string;
  installationToken?: string;
  properties: Record<string, string>;
  identity?: ObservationIdentity;
}
/** A validated batch of 1 to 20 events. */
export interface CollectionBatchV1 {
  schemaVersion: 1;
  events: CollectionEventV1[];
}
/** Per-event disposition returned to the collector. */
export interface CollectionAcknowledgment {
  schemaVersion: 1;
  events: {
    eventId: string;
    disposition: 'accepted' | 'duplicate' | 'redacted';
  }[];
}
/** A rejected observation; `code` is a stable machine-readable reason. */
export class ObservationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ObservationError';
  }
}
/** Most events accepted in one batch. */
export const MAX_BATCH_EVENTS = 20;
/** Largest accepted request body in bytes. */
export const MAX_BODY_BYTES = 65536;
/** The runtime milestone kinds, besides `runtime.session_started`. */
export const MILESTONES = [
  'runtime.first_stream_completed',
  'tool.first_call_executed',
  'component.first_rendered',
] as const;
/** The only event kind the install collector may send. */
export const INSTALL_KIND = 'package.installed';
/** Hashbrown packages an event may name. */
export const PACKAGE_NAMES = [
  '@hashbrownai/core',
  '@hashbrownai/react',
  '@hashbrownai/angular',
  '@hashbrownai/openai',
  '@hashbrownai/anthropic',
  '@hashbrownai/azure',
  '@hashbrownai/bedrock',
  '@hashbrownai/google',
  '@hashbrownai/ollama',
  '@hashbrownai/typesafe',
] as const;
/** UI frameworks a runtime event may report. */
export const INTEGRATIONS = ['react', 'angular'] as const;
/** Transports a runtime event may report. */
export const TRANSPORTS = ['http', 'local', 'delegating', 'custom'] as const;
/** Model providers a runtime event may report. */
export const PROVIDERS = [
  'openai',
  'anthropic',
  'azure',
  'bedrock',
  'google',
  'ollama',
  'typesafe',
] as const;
/** Coarse website content topics. */
export const WEBSITE_TOPICS = [
  'getting_started',
  'concepts',
  'react',
  'angular',
  'platform',
  'reference',
  'blog',
  'other',
] as const;
/** Throws `invalid_payload`. */
export function invalid(): never {
  throw new ObservationError('invalid_payload');
}
/** Validates a UUID v4 and returns it lowercased. */
export function uuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  )
    invalid();
  return value.toLowerCase();
}
function object(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    invalid();
  const record = value as Record<string, unknown>;
  if (
    Reflect.ownKeys(record).some(
      (k) => typeof k !== 'string' || !keys.includes(k),
    )
  )
    invalid();
  return record;
}
function text(value: unknown, cap: number): string {
  if (typeof value !== 'string') invalid();
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) invalid();
  }
  const normalized = value.trim().normalize('NFC');
  if (!normalized || normalized.length > cap) invalid();
  return normalized;
}
function oneOf<const T extends string>(
  value: unknown,
  values: readonly T[],
): T {
  if (typeof value !== 'string' || !values.includes(value as T)) invalid();
  return value as T;
}
/** Validates a collection source name. */
export function collectionSource(value: unknown): CollectionSource {
  return oneOf(value, COLLECTION_SOURCES);
}
const ciProviders = [
  'generic_ci',
  'github_actions',
  'gitlab_ci',
  'jenkins',
  'travis',
  'circleci',
  'bitbucket',
  'buildkite',
];
type PropertyValidator = (value: unknown) => string;
type PropertyRule = [PropertyValidator, boolean?];
const string =
  (cap: number): PropertyValidator =>
  (v) =>
    text(v, cap);
const campaignToken: PropertyValidator = (value) => {
  const token = text(value, 120);
  if (!/^[a-z0-9][a-z0-9_-]{0,119}$/u.test(token)) invalid();
  return token;
};
/** Version and platform tokens: no spaces, `@`, or other identity-shaped text. */
function versionToken(value: unknown): string {
  const token = text(value, 64);
  if (!/^[0-9A-Za-z._+-]{1,64}$/u.test(token)) invalid();
  return token;
}
const enumeration =
  (values: readonly string[]): PropertyValidator =>
  (v) =>
    oneOf(v, values);
const packageRules: Record<string, PropertyRule> = {
  packageName: [enumeration(PACKAGE_NAMES)],
  packageVersion: [versionToken],
};
function properties(
  value: unknown,
  rules: Record<string, PropertyRule>,
): Record<string, string> {
  const input = object(value, Object.keys(rules));
  const result: Record<string, string> = {};
  for (const [key, [validate, optional]] of Object.entries(rules)) {
    if (!(key in input) && optional) continue;
    result[key] = validate(input[key]);
  }
  return result;
}
function hostname(value: unknown): string {
  const host = text(value, 253).toLowerCase();
  if (
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(
      host,
    )
  )
    invalid();
  return host;
}
function identity(value: unknown): ObservationIdentity {
  const record = object(value, [
    'gitEmail',
    'gitDisplayName',
    'gitConfigOrigin',
    'repositoryProvider',
    'repositoryOwner',
  ]);
  const result: ObservationIdentity = {};
  if ('gitEmail' in record) {
    try {
      result.gitEmail = normalizeEmail(text(record.gitEmail, 320));
    } catch {
      invalid();
    }
  }
  if ('gitDisplayName' in record)
    result.gitDisplayName = text(record.gitDisplayName, 160);
  if ('gitConfigOrigin' in record)
    result.gitConfigOrigin = oneOf(record.gitConfigOrigin, [
      'local',
      'global',
      'unknown',
    ]);
  if ('repositoryProvider' in record)
    result.repositoryProvider = oneOf(record.repositoryProvider, [
      'github',
      'gitlab',
      'bitbucket',
    ]);
  if ('repositoryOwner' in record) {
    result.repositoryOwner = text(record.repositoryOwner, 100);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u.test(result.repositoryOwner))
      invalid();
  }
  if (Boolean(result.repositoryOwner) !== Boolean(result.repositoryProvider))
    invalid();
  return result;
}
function parseEvent(
  source: CollectionSource,
  input: unknown,
  now: Date,
): CollectionEventV1 {
  const record = object(input, [
    'eventId',
    'kind',
    'occurredAt',
    'collectorVersion',
    'subject',
    'sessionId',
    'properties',
    'identity',
    'installationToken',
  ]);
  const subject = object(record.subject, ['id', 'namespace', 'scope']);
  const namespace = {
    website: 'website_session',
    install: 'installation',
    runtime: 'development_browser',
  } as const;
  const occurredAt = text(record.occurredAt, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(occurredAt))
    invalid();
  const time = new Date(occurredAt).getTime();
  if (
    !Number.isFinite(time) ||
    time < now.getTime() - 86400000 ||
    time > now.getTime() + 300000
  )
    invalid();
  if (new Date(time).toISOString().slice(0, 19) !== occurredAt.slice(0, 19))
    invalid();
  const event: CollectionEventV1 = {
    eventId: uuid(record.eventId),
    kind: text(record.kind, 100),
    occurredAt: new Date(time).toISOString(),
    collectorVersion: versionToken(record.collectorVersion),
    subject: {
      id: uuid(subject.id),
      namespace: oneOf(subject.namespace, [namespace[source]]),
      scope: oneOf(subject.scope, ['persistent', 'session', 'memory']),
    },
    properties: {},
  };
  if ('sessionId' in record) event.sessionId = uuid(record.sessionId);
  if ('installationToken' in record) {
    if (source === 'website') invalid();
    event.installationToken = uuid(record.installationToken);
  }
  if ('identity' in record) {
    if (source !== 'install') invalid();
    event.identity = identity(record.identity);
  }
  if (source === 'install') {
    if (event.kind !== INSTALL_KIND || event.sessionId) invalid();
    event.properties = properties(record.properties, {
      ...packageRules,
      osFamily: [versionToken],
      architecture: [versionToken],
      nodeVersion: [versionToken],
      environment: [enumeration(['local', 'ci', 'unknown'])],
      environmentEvidence: [
        enumeration([...ciProviders, 'interactive_package_manager', 'unknown']),
      ],
      packageManager: [
        enumeration(['npm', 'pnpm', 'yarn', 'bun', 'unknown']),
        true,
      ],
      packageManagerVersion: [string(64), true],
      ciProvider: [enumeration(ciProviders), true],
      consumerContext: [enumeration(['checkout', 'unavailable']), true],
    });
    const p = event.properties;
    if (
      p.ciProvider &&
      (p.environment !== 'ci' || p.ciProvider !== p.environmentEvidence)
    )
      invalid();
    if (p.environment === 'ci' && !ciProviders.includes(p.environmentEvidence))
      invalid();
    if (
      p.environment === 'local' &&
      p.environmentEvidence !== 'interactive_package_manager'
    )
      invalid();
    if (p.environment === 'unknown' && p.environmentEvidence !== 'unknown')
      invalid();
  } else if (source === 'runtime') {
    if (
      !event.sessionId ||
      !['runtime.session_started', ...MILESTONES].includes(event.kind)
    )
      invalid();
    event.properties = properties(record.properties, {
      ...packageRules,
      integration: [enumeration(INTEGRATIONS)],
      transport: [enumeration(TRANSPORTS)],
      provider: [enumeration(PROVIDERS), true],
      ...(event.kind === 'runtime.first_stream_completed'
        ? {
            durationBucket: [
              enumeration(['lt_1s', '1s_to_5s', '5s_to_30s', '30s_plus']),
              true,
            ] as PropertyRule,
          }
        : {}),
    });
  } else {
    const kinds: Record<string, Record<string, PropertyRule>> = {
      'website.session_started': {
        campaignSource: [campaignToken, true],
        campaignMedium: [campaignToken, true],
        campaignName: [campaignToken, true],
        referrerHost: [hostname, true],
      },
      'website.content_viewed': {
        contentId: [string(120)],
        topic: [enumeration(WEBSITE_TOPICS)],
      },
    };
    if (!Object.hasOwn(kinds, event.kind)) invalid();
    event.properties = properties(record.properties, kinds[event.kind]);
  }
  return event;
}
/**
 * Validates a raw batch for a source against the closed contract.
 *
 * @throws ObservationError `invalid_payload` or `unsupported_version`.
 */
export function parseCollectionBatch(
  source: CollectionSource,
  value: unknown,
  receivedAt: Date,
): CollectionBatchV1 {
  collectionSource(source);
  if (!Number.isFinite(receivedAt.getTime())) invalid();
  const record = object(value, ['schemaVersion', 'events']);
  if (record.schemaVersion !== 1)
    throw new ObservationError('unsupported_version');
  if (
    !Array.isArray(record.events) ||
    !record.events.length ||
    record.events.length > MAX_BATCH_EVENTS
  )
    invalid();
  const events = record.events.map((v) => parseEvent(source, v, receivedAt));
  if (new Set(events.map((e) => e.eventId)).size !== events.length) invalid();
  return { schemaVersion: 1, events };
}
