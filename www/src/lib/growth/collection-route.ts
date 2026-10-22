import {
  acceptObservationBatch,
  type CollectionBatchV1,
  collectionSource,
  consumeSourceBudget,
  consumeSubjectBudgets,
  createDatabaseExecutor,
  type EmailHmacKeyring,
  MAX_BODY_BYTES,
  ObservationError,
  parseCollectionBatch,
  parseEmailHmacKeyring,
  type SqlExecutor,
} from '@hashbrownai-internal/growth';

import { readBoundedBody } from '../../app/%5F/_internal/read-bounded-body';
import { isKnownWebsiteContent } from './website-content';
import { selectRuntimeAnnouncements } from './runtime-announcements';

/** What the collection route reads, writes, and logs through. */
export interface CollectionRouteDependencies {
  environment(): Readonly<Record<string, string | undefined>>;
  createDatabase(): SqlExecutor;
  loadKeyring(): EmailHmacKeyring;
  now(): Date;
  sourceBudget: typeof consumeSourceBudget;
  subjectBudgets: typeof consumeSubjectBudgets;
  accept: typeof acceptObservationBatch;
  filterWebsite(batch: CollectionBatchV1): CollectionBatchV1;
  runtimeAnnouncements: typeof selectRuntimeAnnouncements;
  log(event: Readonly<Record<string, string | number>>): void;
}

/**
 * Removes `website.content_viewed` events that report a page outside the
 * content catalog (or a topic other than that page's own), so a 404 or stale
 * link cannot sink the rest of its batch. Other events are untouched.
 *
 * @param batch - A parsed website batch.
 * @returns The batch without its unknown content views.
 */
export function filterWebsiteCollection(
  batch: CollectionBatchV1,
): CollectionBatchV1 {
  return {
    ...batch,
    events: batch.events.filter(
      (event) =>
        event.kind !== 'website.content_viewed' ||
        isKnownWebsiteContent(
          event.properties.contentId,
          event.properties.topic,
        ),
    ),
  };
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Expose-Headers': 'Retry-After',
  'Cache-Control': 'no-store',
};
function response(
  status: number,
  body: unknown,
  retryAfter?: number,
): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      ...(retryAfter === undefined
        ? {}
        : { 'Retry-After': String(retryAfter) }),
    },
  });
}
/**
 * A bounded, value-free cause for a log line: the {@link ObservationError}
 * code, else the error's name (never its message), at most 80 characters.
 */
function errorCause(error: unknown): string {
  const cause =
    error instanceof ObservationError
      ? error.code
      : error instanceof Error
        ? error.name
        : 'unknown';
  return cause.slice(0, 80);
}
async function readCollectionBody(request: Request): Promise<string | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  // Cancel the reader's underlying stream on timeout rather than leave a hung body read alive.
  const controller = new AbortController();
  const relay = new TransformStream<Uint8Array, Uint8Array>();
  const piping = request.body
    ?.pipeTo(relay.writable, { signal: controller.signal })
    .catch(() => undefined);
  try {
    const boundedRequest = new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body ? relay.readable : null,
      duplex: 'half',
    } as RequestInit);
    return await Promise.race([
      readBoundedBody(boundedRequest, MAX_BODY_BYTES),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve(null);
        }, 3000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    controller.abort();
    void piping;
  }
}

/**
 * Builds the `/_/growth/collect/v1/[source]` handler. It charges the source
 * budget before reading the body, validates and rate-limits the batch, and
 * acknowledges only after the durable write. Responses carry `{ error: code }`
 * and never echo payload values.
 *
 * @param deps - The route's dependencies.
 */
export function createCollectionRoute(deps: CollectionRouteDependencies) {
  return async (request: Request, sourceInput: unknown): Promise<Response> => {
    let source;
    try {
      source = collectionSource(sourceInput);
    } catch {
      return response(404, { error: 'unknown_source' });
    }
    if (request.method === 'OPTIONS') return response(204, null);
    if (request.method !== 'POST')
      return response(405, { error: 'method_not_allowed' });
    const start = Date.now();
    let db: SqlExecutor | undefined;
    let eventCount = 0;
    const report = (
      status: number,
      code: string,
      retryAfter?: number,
      error?: unknown,
    ) => {
      try {
        deps.log({
          event: 'growth.collection',
          source,
          code,
          status,
          eventCount,
          latencyMs: Date.now() - start,
          ...(error === undefined ? {} : { cause: errorCause(error) }),
        });
      } catch {
        /* Diagnostics cannot change acceptance. */
      }
      return response(status, { error: code }, retryAfter);
    };
    try {
      let configured;
      try {
        configured = (deps.environment()['GROWTH_COLLECTION_SOURCES'] ?? '')
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
          .map(collectionSource);
      } catch (error) {
        return report(503, 'collection_configuration', 60, error);
      }
      if (!configured.includes(source))
        return report(503, 'collection_disabled', 60);
      db = deps.createDatabase();
      const admission = await deps.sourceBudget(db, source, deps.now());
      if (!admission.allowed)
        return report(429, 'rate_limited', admission.retryAfterSec);
      if (
        request.headers
          .get('content-type')
          ?.split(';')[0]
          .trim()
          .toLowerCase() !== 'application/json'
      )
        return report(415, 'content_type');
      const raw = await readCollectionBody(request);
      if (raw === null) return report(413, 'body_limit');
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch (error) {
        return report(400, 'invalid_payload', undefined, error);
      }
      const now = deps.now();
      const parsed = parseCollectionBatch(source, json, now);
      const batch = source === 'website' ? deps.filterWebsite(parsed) : parsed;
      const dropped = parsed.events.length - batch.events.length;
      eventCount = batch.events.length;
      const droppedProperty: Record<string, number> =
        dropped > 0 ? { droppedUnknownContent: dropped } : {};
      if (dropped > 0 && batch.events.length === 0) {
        try {
          deps.log({
            event: 'growth.collection',
            source,
            code: 'committed',
            status: 200,
            eventCount,
            accepted: 0,
            duplicate: 0,
            redacted: 0,
            ...droppedProperty,
            latencyMs: Date.now() - start,
          });
        } catch {
          /* Diagnostics cannot change acceptance. */
        }
        return response(200, { schemaVersion: 1, events: [] });
      }
      const subjects = await deps.subjectBudgets(db, source, batch.events, now);
      if (!subjects.allowed)
        return report(429, 'rate_limited', subjects.retryAfterSec);
      const result = await deps.accept(db, source, batch, {
        now,
        ...(batch.events.some((e) => e.identity)
          ? { keyring: deps.loadKeyring() }
          : {}),
      });
      try {
        deps.log({
          event: 'growth.collection',
          source,
          code: 'committed',
          status: 200,
          eventCount,
          accepted: result.events.filter((e) => e.disposition === 'accepted')
            .length,
          duplicate: result.events.filter((e) => e.disposition === 'duplicate')
            .length,
          redacted: result.events.filter((e) => e.disposition === 'redacted')
            .length,
          ...droppedProperty,
          latencyMs: Date.now() - start,
        });
      } catch {
        /* Committed result remains authoritative. */
      }
      if (source === 'runtime') {
        try {
          return response(200, {
            ...result,
            announcements: deps.runtimeAnnouncements(batch, now),
          });
        } catch {
          // Catalog selection or serialization cannot invalidate a committed acknowledgment.
          return response(200, { ...result, announcements: [] });
        }
      }
      return response(200, result);
    } catch (error) {
      if (error instanceof ObservationError) {
        if (error.code === 'event_conflict')
          return report(409, error.code, undefined, error);
        if (['invalid_payload', 'unsupported_version'].includes(error.code))
          return report(400, error.code, undefined, error);
      }
      return report(503, 'collection_unavailable', 30, error);
    } finally {
      await db?.close?.().catch(() => undefined);
    }
  };
}

/** Production dependencies: the database, `process.env`, and `console.info`. */
export function defaultCollectionRouteDependencies(): CollectionRouteDependencies {
  return {
    environment: () => process.env,
    createDatabase: () => createDatabaseExecutor(),
    loadKeyring: () => parseEmailHmacKeyring(process.env),
    now: () => new Date(),
    sourceBudget: consumeSourceBudget,
    subjectBudgets: consumeSubjectBudgets,
    accept: acceptObservationBatch,
    filterWebsite: filterWebsiteCollection,
    runtimeAnnouncements: selectRuntimeAnnouncements,
    log: (event) => console.info(JSON.stringify(event)),
  };
}
