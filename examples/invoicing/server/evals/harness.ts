import {
  type AgentHarness,
  type AgentRunResult,
  type Aimock,
  createAgentHarness,
  createAimock,
  type FixtureSet,
  type ScriptBuilder,
} from '@b4run/testing';
import { fileURLToPath } from 'node:url';
import { assistantContext } from '../src/assistant-middleware';
import { getSnapshot } from '../src/ledger';
import { createSampleLedger } from '../src/sample-ledger';
import { recordingsToFixtures } from './fixtures';

export type HarnessMode = 'replay' | 'record' | 'live';

export interface InvoicingHarness {
  /** Send one user turn on a fresh thread through the `/assistant` agent. */
  run(opts: {
    input: string;
    fixtures?: FixtureSet | ScriptBuilder;
  }): Promise<AgentRunResult>;
  /**
   * Fixtures for every model call made since the most recent `run()` began,
   * up to now; record mode only. Scorers such as the LLM judge call the model
   * after `run()` returns, so read this just before the next `run()` (or once
   * the whole eval has resolved) to get a case's complete tape.
   */
  getRecordedFixtures(): FixtureSet;
  close(): Promise<void>;
}

/** The B4 app root: the server directory. */
export const appRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * What `assistant-middleware.ts` hands the tools for a fresh session: the
 * untouched sample ledger, the same base every server session materializes.
 * `createAgentHarness` invokes the agent directly, so the route middleware
 * never runs and this stands in for it.
 */
export function evalMiddlewareContext() {
  const snapshot = getSnapshot(createSampleLedger());
  return assistantContext(async () => snapshot);
}

/**
 * Load `INVOICING_ENV_FILE` (if set) into `process.env`, exactly as `serve`
 * does, and return a function that puts the environment back as it was
 * found: variables the file added are removed, ones it changed are restored.
 */
function loadEnvFile(): () => void {
  const before: Record<string, string | undefined> = { ...process.env };
  const envFile = process.env['INVOICING_ENV_FILE'];
  if (envFile) process.loadEnvFile(envFile);
  return () => {
    for (const key of Object.keys(process.env))
      if (!(key in before)) delete process.env[key];
    for (const [key, value] of Object.entries(before)) process.env[key] = value;
  };
}

/**
 * Drive the `/assistant` agent through B4's `createAgentHarness` with the
 * middleware context the tools expect, the model pointed at an aimock so
 * evals replay recorded fixtures, record new ones against the real API, or
 * run live.
 *
 * Record mode chains a second aimock behind the harness's own: the harness
 * proxies to it, and it proxies to the real API and keeps the raw request and
 * response of every call. `AgentHarness.getRecordedFixtures()` re-keys
 * recordings by their ordinal and the first user message, which does not
 * replay for this app (see `recordingsToFixtures` in `fixtures.ts`), and the
 * harness does not expose its journal, so the tape is cut here instead.
 */
export async function createInvoicingHarness(opts: {
  mode: HarnessMode;
  recordUpstream?: string;
}): Promise<InvoicingHarness> {
  const restoreEnv = loadEnvFile();
  if (opts.mode !== 'replay' && !process.env['OPENAI_API_KEY']) {
    restoreEnv();
    throw new Error(
      `Set OPENAI_API_KEY or INVOICING_ENV_FILE to run the evals in ${opts.mode} mode.`,
    );
  }

  let tape: Aimock | undefined;
  let harness: AgentHarness | undefined;
  try {
    if (opts.mode === 'record')
      tape = await createAimock({
        fixtures: [],
        proxy: { openai: opts.recordUpstream ?? 'https://api.openai.com' },
        record: true,
      });
    harness = await createAgentHarness({
      appRoot,
      route: '/assistant#agent',
      middlewareContext: evalMiddlewareContext(),
      live: opts.mode === 'live',
      record: opts.mode === 'record',
      // aimock appends the request path, so the upstream is the origin only.
      ...(tape ? { recordUpstream: new URL(tape.baseUrl).origin } : {}),
    });
  } catch (error) {
    try {
      await harness?.close();
    } finally {
      try {
        await tape?.close();
      } finally {
        restoreEnv();
      }
    }
    throw error;
  }

  const agent = harness;
  let journalStart = 0;
  let fixtureStart = 0;
  return {
    async run({ input, fixtures }) {
      // A fresh thread per case, and in replay no fixture left over from the
      // previous case (the harness registers fixtures additively).
      agent.reset();
      if (tape) {
        // Recordings register as live fixtures on the tape as they are made;
        // drop the previous case's so they can never answer this one.
        tape.clearFixtures();
        journalStart = tape.getRequests().length;
        fixtureStart = tape.getFixtureCount();
      }
      return agent.run({ input, ...(fixtures ? { fixtures } : {}) });
    },
    getRecordedFixtures() {
      if (!tape)
        throw new Error('recorded fixtures are only available in record mode');
      return recordingsToFixtures(
        tape.getRecordingsSince(journalStart, fixtureStart),
      );
    },
    async close() {
      try {
        await agent.close();
      } finally {
        try {
          await tape?.close();
        } finally {
          restoreEnv();
        }
      }
    },
  };
}
