import { createRuntimeRequestListener } from '@b4run/cli/runtime';
import {
  createAimock,
  type FixtureSet,
  type ScriptBuilder,
} from '@b4run/testing';
import { assistantResponseSchema } from '@invoicing/contracts';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import handler from '../src/api';
import middleware from '../src/middleware';
import { collectRun, type InvoicingRunResult } from './collect-run';
import { recordingsToFixtures } from './fixtures';

export type HarnessMode = 'replay' | 'record' | 'live';

export interface InvoicingHarness {
  /** Origin of the in-process server, e.g. `http://127.0.0.1:51234`. */
  readonly baseUrl: string;
  /** Send one user turn on a fresh thread through the real assistant route. */
  run(opts: {
    input: string;
    fixtures?: FixtureSet | ScriptBuilder;
    state?: Record<string, unknown>;
  }): Promise<InvoicingRunResult>;
  /** Fixtures for the model calls the last `run()` proxied (record mode only). */
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

/**
 * Boot the invoicing server in-process, exactly as `main.ts` wires it, with
 * the model pointed at an aimock so evals replay recorded fixtures, record new
 * ones against the real API, or run live. Memory repositories are forced so a
 * developer's `DATABASE_URL` never receives eval sessions.
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

  const upstream = opts.recordUpstream ?? 'https://api.openai.com';
  const aimock = await createAimock(
    opts.mode === 'replay'
      ? { fixtures: [] }
      : {
          fixtures: [],
          proxy: { openai: upstream },
          ...(opts.mode === 'record' ? { record: true } : {}),
        },
  );
  process.env['OPENAI_BASE_URL'] = aimock.baseUrl;

  const runtime = await createRuntimeRequestListener({ appRoot, middleware });
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
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  let lastWindow: { journalStart: number; fixtureStart: number } | undefined;

  return {
    baseUrl,
    async run({ input, fixtures, state = {} }) {
      if (opts.mode === 'replay') {
        aimock.clearFixtures();
        aimock.addFixtures(toFixtures(fixtures));
      } else if (opts.mode === 'record') {
        lastWindow = {
          journalStart: aimock.getRequests().length,
          fixtureStart: aimock.getFixtureCount(),
        };
      }
      const session = await fetch(`${baseUrl}/api/snapshot`);
      const cookie = session.headers.get('set-cookie')?.split(';')[0];
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
    lastRecordedFixtures() {
      if (!lastWindow) return [];
      return recordingsToFixtures(
        aimock.getRecordingsSince(
          lastWindow.journalStart,
          lastWindow.fixtureStart,
        ),
      );
    },
    async close() {
      server.close();
      server.closeAllConnections();
      await runtime.close();
      await aimock.close();
      restoreEnv(previous);
    },
  };
}
