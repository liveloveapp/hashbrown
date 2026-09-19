import { createRuntimeRequestListener } from '@b4run/cli/runtime';
import { createThreadsStore } from '@b4run/sqlite-storage';
import {
  type Aimock,
  createAimock,
  type FixtureSet,
  type ScriptBuilder,
} from '@b4run/testing';
import { assistantResponseSchema } from '@invoicing/contracts';
import { MemorySaver } from '@langchain/langgraph-checkpoint';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../src/api';
import middleware from '../src/middleware';
import { collectRun, type InvoicingRunResult } from './collect-run';
import { recordingsToFixtures } from './fixtures';

export type HarnessMode = 'replay' | 'record' | 'live';

/** A point in the aimock journal; recordings are windowed between two of them. */
export interface RecordMark {
  readonly journalStart: number;
  readonly fixtureStart: number;
}

export interface InvoicingHarness {
  /** Origin of the in-process server, e.g. `http://127.0.0.1:51234`. */
  readonly baseUrl: string;
  /** Send one user turn on a fresh thread through the real assistant route. */
  run(opts: {
    input: string;
    fixtures?: FixtureSet | ScriptBuilder;
    state?: Record<string, unknown>;
  }): Promise<InvoicingRunResult>;
  /** Where the aimock journal stands now; any mode. */
  mark(): RecordMark;
  /**
   * Fixtures for every model call proxied since `mark`, up to `until` when
   * given; record mode only. Scorers such as an LLM judge call the model
   * after `run()` returns, so a case's tape is everything between its own
   * mark and the next case's.
   */
  recordedFixturesSince(mark: RecordMark, until?: RecordMark): FixtureSet;
  /** `recordedFixturesSince` from the last `run()`'s mark; record mode only. */
  lastRecordedFixtures(): FixtureSet;
  close(): Promise<void>;
}

const envKeys = ['OPENAI_BASE_URL', 'OPENAI_API_KEY', 'DATABASE_URL'] as const;

const appRoot = fileURLToPath(new URL('..', import.meta.url));

/** The AG-UI body the React client posts to `/assistant`. */
function assistantBody(
  threadId: string,
  input: string,
  state: Record<string, unknown>,
) {
  return {
    threadId,
    runId: randomUUID(),
    messages: [{ id: randomUUID(), role: 'user', content: input }],
    tools: [],
    context: [],
    state,
    forwardedProps: {},
    hashbrown: { ui: true, responseSchema: assistantResponseSchema },
  };
}

function toFixtures(fixtures: FixtureSet | ScriptBuilder | undefined) {
  if (!fixtures) return [];
  return Array.isArray(fixtures) ? fixtures : fixtures.build();
}

/** Restore each remembered variable, deleting the ones that were unset. */
function restoreEnv(previous: Record<string, string | undefined>) {
  for (const key of envKeys) {
    const value = previous[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string')
        reject(new Error('server did not bind a TCP port'));
      else resolve(address.port);
    });
  });
}

function startAimock(mode: HarnessMode, upstream: string): Promise<Aimock> {
  if (mode === 'replay') return createAimock({ fixtures: [] });
  return createAimock({
    fixtures: [],
    proxy: { openai: upstream },
    ...(mode === 'record' ? { record: true } : {}),
  });
}

/**
 * Boot the invoicing server in-process, exactly as `main.ts` wires it, with
 * the model pointed at an aimock so evals replay recorded fixtures, record new
 * ones against the real API, or run live. Storage is isolated from `b4 dev`:
 * memory repositories (so a developer's `DATABASE_URL` never receives eval
 * sessions), an in-memory checkpointer, and a threads store in a temp dir
 * that is removed on close.
 */
export async function createInvoicingHarness(opts: {
  mode: HarnessMode;
  recordUpstream?: string;
}): Promise<InvoicingHarness> {
  if (process.env['INVOICING_ENV_FILE'])
    process.loadEnvFile(process.env['INVOICING_ENV_FILE']);
  const previous = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
  if (opts.mode === 'replay') process.env['OPENAI_API_KEY'] = 'mock';
  else if (!process.env['OPENAI_API_KEY'])
    throw new Error(
      `Set OPENAI_API_KEY or INVOICING_ENV_FILE to run the evals in ${opts.mode} mode.`,
    );
  delete process.env['DATABASE_URL'];

  let aimock: Aimock | undefined;
  let storageDir: string | undefined;
  try {
    aimock = await startAimock(
      opts.mode,
      opts.recordUpstream ?? 'https://api.openai.com',
    );
    process.env['OPENAI_BASE_URL'] = aimock.baseUrl;
    storageDir = mkdtempSync(join(tmpdir(), 'invoicing-evals-'));
    return await boot(opts.mode, aimock, storageDir, previous);
  } catch (error) {
    if (storageDir) rmSync(storageDir, { recursive: true, force: true });
    try {
      await aimock?.close();
    } finally {
      restoreEnv(previous);
    }
    throw error;
  }
}

async function boot(
  mode: HarnessMode,
  aimock: Aimock,
  storageDir: string,
  previousEnv: Record<string, string | undefined>,
): Promise<InvoicingHarness> {
  const runtime = await createRuntimeRequestListener({
    appRoot,
    middleware,
    checkpointer: new MemorySaver(),
    threadsStore: createThreadsStore({
      path: join(storageDir, 'threads.sqlite'),
    }),
  });
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (
      path.startsWith('/agui/') ||
      path.startsWith('/threads') ||
      path === '/healthz'
    )
      runtime.listener(request, response);
    else void handler(request, response);
  });
  let port: number;
  try {
    port = await listen(server);
  } catch (error) {
    await runtime.close();
    throw error;
  }
  const baseUrl = `http://127.0.0.1:${port}`;
  let lastWindow: RecordMark | undefined;
  const mark = (): RecordMark => ({
    journalStart: aimock.getRequests().length,
    fixtureStart: aimock.getFixtureCount(),
  });
  const recordedFixturesSince = (from: RecordMark, until?: RecordMark) => {
    if (mode !== 'record')
      throw new Error('recorded fixtures are only available in record mode');
    const recordings = aimock.getRecordingsSince(
      from.journalStart,
      from.fixtureStart,
    );
    return recordingsToFixtures(
      until
        ? recordings.slice(0, until.fixtureStart - from.fixtureStart)
        : recordings,
    );
  };

  return {
    baseUrl,
    async run({ input, fixtures, state = {} }) {
      if (mode === 'replay') {
        aimock.clearFixtures();
        aimock.addFixtures(toFixtures(fixtures));
      } else if (mode === 'record') {
        lastWindow = mark();
      }
      const session = await fetch(`${baseUrl}/api/snapshot`);
      const cookie = session.headers.getSetCookie()[0]?.split(';')[0];
      if (!session.ok || !cookie)
        throw new Error(
          `GET /api/snapshot did not open a session: ${session.status} ${await session.text()}`,
        );
      const threadId = randomUUID();
      const response = await fetch(`${baseUrl}/agui/%2Fassistant%23agent`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(assistantBody(threadId, input, state)),
      });
      if (response.status !== 200)
        throw new Error(
          `POST /assistant failed: ${response.status} ${await response.text()}`,
        );
      return collectRun(response, threadId);
    },
    mark,
    recordedFixturesSince,
    lastRecordedFixtures() {
      if (mode !== 'record')
        throw new Error(
          'lastRecordedFixtures is only available in record mode',
        );
      return lastWindow ? recordedFixturesSince(lastWindow) : [];
    },
    async close() {
      // Same order as main.ts: stop accepting, drain the runtime, then drop
      // whatever connections are still open. Each step runs even if an
      // earlier one rejects.
      const closed = new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      try {
        await runtime.close();
      } finally {
        server.closeAllConnections();
        try {
          await closed;
        } finally {
          try {
            await aimock.close();
          } finally {
            rmSync(storageDir, { recursive: true, force: true });
            restoreEnv(previousEnv);
          }
        }
      }
    },
  };
}
