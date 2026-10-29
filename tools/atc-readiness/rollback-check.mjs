/** Preview-only rollback rehearsal. Imports perform no IO, model calls or routing mutations. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, open, lstat, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import {
  sha256,
  hashTree,
  stableStringify,
  createRedactor,
  readSseStream,
  canonicalStorageSummary,
  resolveRuntimeDependency,
} from './common.mjs';
import { storageContext } from './storage.mjs';
import { timeoutBound } from './managed-timeout-io.mjs';
import { withRolloutRun } from './rollout-controls.mjs';

const SOURCE = 'a2f92a4f02ab1dfc38051a44e509afb439634793';
/** Validate independent exact ownership and distinct compiled backend artifact identities. */
export function validateRollbackPlan(plan) {
  assert(
    plan &&
      plan.runId &&
      plan.createdForRun === plan.runId &&
      plan.aliasId &&
      plan.projectId &&
      plan.ownerId &&
      plan.initialDeploymentId &&
      /^readiness-[a-z0-9-]+\.vercel\.app$/.test(plan.alias) &&
      Array.isArray(plan.productionAliases) &&
      !plan.productionAliases.includes(plan.alias),
    'rollback requires exact test-only preview alias and initial mapping',
  );
  for (const backend of ['b4', 'openai']) {
    const candidate = plan[backend];
    assert(
      candidate?.id &&
        candidate.projectId === plan.projectId &&
        candidate.ownerId === plan.ownerId &&
        candidate.target === 'preview' &&
        candidate.readyState === 'READY' &&
        candidate.backend === backend &&
        candidate.sourceCommit === SOURCE,
      'rollback artifact identity mismatch',
    );
    for (const key of [
      'artifactSha256',
      'outputTreeSha256',
      'functionTreeSha256',
      'lockSha256',
    ])
      assert(
        /^[a-f0-9]{64}$/.test(candidate[key]),
        'rollback complete artifact bindings missing',
      );
  }
  assert.notEqual(
    plan.b4.id,
    plan.openai.id,
    'rollback needs distinct immutable artifacts',
  );
  assert.notEqual(
    plan.b4.artifactSha256,
    plan.openai.artifactSha256,
    'rollback cannot switch backend using environment alone',
  );
  assert.notEqual(
    plan.b4.functionTreeSha256,
    plan.openai.functionTreeSha256,
    'rollback function trees must differ',
  );
  assert.equal(
    plan.b4.lockSha256,
    plan.openai.lockSha256,
    'rollback source lock mismatch',
  );
  assert(
    [plan.b4.id, plan.openai.id].includes(plan.initialDeploymentId),
    'rollback initial mapping must be a verified candidate',
  );
  return plan;
}

/** Real authenticated Vercel API adapter; persists routing intent and verifies every service mapping. */
export function createVercelAlias({
  token,
  plan,
  persist,
  fetch: transport = globalThis.fetch,
}) {
  validateRollbackPlan(plan);
  assert(
    typeof token === 'string' && token.trim(),
    'Vercel management auth required',
  );
  assert.equal(
    typeof persist,
    'function',
    'durable owned-alias inventory required',
  );
  const api = (path, method, bounds, body) =>
    timeoutBound(async (signal) => {
      const response = await transport(
        'https://api.vercel.com' +
          path +
          '?teamId=' +
          encodeURIComponent(plan.ownerId),
        {
          method,
          headers: {
            authorization: 'Bearer ' + token,
            'content-type': 'application/json',
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          redirect: 'error',
          signal,
        },
      );
      if (response.status === 404 && method === 'GET') return null;
      assert(
        response.ok,
        'Vercel routing API failed; inspect state before another mutation',
      );
      return response.status === 204
        ? {}
        : timeoutBound(() => response.json(), { ...bounds, signal });
    }, bounds);
  const path = '/v4/aliases/' + encodeURIComponent(plan.alias);
  const inspect = async (bounds) => {
    const value = await api(path, 'GET', bounds);
    assert(
      value &&
        value.uid === plan.aliasId &&
        value.alias === plan.alias &&
        value.projectId === plan.projectId &&
        (value.teamId ?? value.team?.id) === plan.ownerId,
      'rollback alias identity mismatch',
    );
    const deploymentId = value.deploymentId ?? value.deployment?.id;
    assert(
      [plan.b4.id, plan.openai.id].includes(deploymentId),
      'rollback alias maps to unexpected deployment',
    );
    return {
      aliasId: value.uid,
      alias: value.alias,
      deploymentId,
      projectId: value.projectId,
      ownerId: plan.ownerId,
    };
  };
  return {
    inspect,
    verifyDeployment: async (candidate, bounds) => {
      const value = await api(
        '/v13/deployments/' + encodeURIComponent(candidate.id),
        'GET',
        bounds,
      );
      assert(
        value &&
          value.id === candidate.id &&
          value.projectId === plan.projectId &&
          (value.teamId ?? value.team?.id ?? value.ownerId) === plan.ownerId &&
          value.readyState === 'READY' &&
          [null, 'preview'].includes(value.target) &&
          value.meta?.githubCommitSha === SOURCE,
        'rollback uploaded deployment identity mismatch',
      );
      return {
        id: value.id,
        url: value.url,
        projectId: value.projectId,
        readyState: value.readyState,
        serviceTarget: value.target,
        inspectionTarget: candidate.target,
      };
    },
    assign: async (id, bounds) => {
      assert(
        [plan.b4.id, plan.openai.id].includes(id),
        'rollback unowned target',
      );
      const before = await inspect(bounds);
      await timeoutBound(
        () =>
          persist({
            action: 'assign-intent',
            before,
            deploymentId: id,
            atMs: Date.now(),
          }),
        bounds,
      );
      await api(
        '/v2/deployments/' + encodeURIComponent(id) + '/aliases',
        'POST',
        bounds,
        { alias: plan.alias },
      );
      const after = await inspect(bounds);
      assert.equal(after.deploymentId, id, 'rollback route did not converge');
      await timeoutBound(
        () =>
          persist({ action: 'assign-verified', ...after, atMs: Date.now() }),
        bounds,
      );
    },
    remove: async (bounds) => {
      const before = await inspect(bounds);
      assert.equal(
        before.deploymentId,
        plan.initialDeploymentId,
        'rollback initial mapping not restored',
      );
      await timeoutBound(
        () => persist({ action: 'delete-intent', ...before, atMs: Date.now() }),
        bounds,
      );
      await api(
        '/v2/aliases/' + encodeURIComponent(plan.aliasId),
        'DELETE',
        bounds,
      );
      assert.equal(
        await api(path, 'GET', bounds),
        null,
        'owned alias removal not verified',
      );
      await timeoutBound(
        () =>
          persist({
            action: 'removed',
            aliasId: plan.aliasId,
            atMs: Date.now(),
          }),
        bounds,
      );
    },
  };
}

/** Rehearse two fresh visitor requests within the four-reservation cap; restore and verify before deletion. */
export async function runRollbackProtocol({
  plan,
  control,
  alias,
  io,
  receipt = {},
  registerCleanup,
}) {
  validateRollbackPlan(plan);
  receipt.qualified = false;
  receipt.attempts = [];
  receipt.threadIds = [];
  receipt.limitations = {
    existingConversations:
      'B4 threads cannot transparently continue as durable B4 threads on direct OpenAI',
  };
  const initial = await alias.inspect(control);
  assert.equal(
    initial.deploymentId,
    plan.initialDeploymentId,
    'rollback initial mapping mismatch',
  );
  receipt.initial = initial;
  let touched = false;
  let cleanupPromise;
  const cleanupAlias = async () => {
    // Fresh bounded restoration is required even when the phase signal/deadline has expired.
    const cleanupBounds = {
      signal: new AbortController().signal,
      deadlineMs: Date.now() + 55000,
    };
    if (touched) {
      await alias.assign(plan.initialDeploymentId, cleanupBounds);
      receipt.restored = await alias.inspect(cleanupBounds);
      assert.equal(
        receipt.restored.deploymentId,
        plan.initialDeploymentId,
        'rollback restoration missing',
      );
      await alias.remove(cleanupBounds);
      receipt.aliasRemoved = true;
    }
  };
  const finalizeAlias = () => (cleanupPromise ??= cleanupAlias());
  registerCleanup?.(finalizeAlias);
  try {
    for (const backend of ['b4', 'openai']) {
      touched = true;
      await alias.assign(plan[backend].id, control);
      const before = await io.snapshot(control);
      const threadId = 'readiness-rollback-' + randomUUID();
      const id = randomUUID();
      receipt.threadIds.push(threadId);
      await control.dispatch(
        { phase: 'rollback', id, kind: 'normal', threadId },
        async (bounds) => {
          const attempt = {
            id,
            ordinal: bounds.ordinal,
            kind: 'normal',
            threadId,
            runId: randomUUID(),
            terminalUsage: null,
            terminalModel: null,
            terminalProviderResponseId: null,
            providerUsage: null,
          };
          receipt.attempts.push(attempt);
          const onRequestObserved = (request) => {
            for (const key of [
              'runId',
              'status',
              'requestId',
              'terminalUsage',
              'terminalModel',
              'terminalProviderResponseId',
              'providerUsage',
            ])
              if (request[key] !== undefined) attempt[key] = request[key];
          };
          let response;
          try {
            response = await io.request({
              ...bounds,
              runId: attempt.runId,
              onRequestObserved,
              backend,
              threadId,
              deployment: plan[backend],
            });
          } catch (error) {
            attempt.outcome = 'failed';
            throw error;
          }
          onRequestObserved(response);
          assert.equal(response.status, 200, 'rollback request failed');
          assert.equal(
            response.deploymentId,
            plan[backend].id,
            'actual rollback route mismatch',
          );
          assert.equal(
            response.backend,
            backend,
            'actual rollback backend mismatch',
          );
          assert.equal(response.threadId, threadId);
          assert(
            response.outputSha256 && response.markerSha256,
            'rollback validated schema/marker evidence required',
          );
          Object.assign(attempt, response, { outcome: 'passed' });
          return { ...response, outcome: 'passed' };
        },
      );
      if (backend === 'openai')
        assert.deepEqual(
          await io.snapshot(control),
          before,
          'unexpected B4 state write on OpenAI request',
        );
      const immediate = await io.snapshot(control);
      assert(
        (await io.waitQuiescent(control)) >= 75000,
        'rollback requires at least 75 seconds',
      );
      assert.deepEqual(
        await io.snapshot(control),
        immediate,
        'rollback full state changed after 75 seconds',
      );
      receipt[backend + 'State'] = immediate;
    }
  } finally {
    await finalizeAlias();
  }
  receipt.qualified = true;
  return receipt;
}

/** Verify local complete compiled trees and byte digests against independently inspected backend outputs. */
export async function verifyRollbackArtifacts(options, plan) {
  validateRollbackPlan(plan);
  for (const backend of ['b4', 'openai']) {
    const paths = options[backend];
    const candidate = plan[backend];
    assert.equal(
      await hashTree(paths.outputTreePath),
      candidate.outputTreeSha256,
      'rollback complete output tree mismatch',
    );
    assert.equal(
      await hashTree(paths.functionTreePath),
      candidate.functionTreeSha256,
      'rollback complete function tree mismatch',
    );
    assert.equal(
      sha256(await readFile(paths.artifactPath)),
      candidate.artifactSha256,
      'rollback executable artifact mismatch',
    );
    assert.equal(
      sha256(await readFile(join(paths.runtimeRoot, 'package-lock.json'))),
      candidate.lockSha256,
      'rollback exact source lock mismatch',
    );
    const config = JSON.parse(
      await readFile(join(paths.functionTreePath, '.vc-config.json'), 'utf8'),
    );
    assert.equal(
      config.maxDuration,
      60,
      'rollback candidate must be normal duration',
    );
    const output = JSON.parse(
      await readFile(join(paths.outputTreePath, 'config.json'), 'utf8'),
    );
    assert(
      output.version === 3 &&
        output.routes?.some((route) => route.handle === 'filesystem') &&
        resolve(paths.functionTreePath) ===
          resolve(paths.outputTreePath, 'functions/api/run.func'),
      'rollback run route missing',
    );
    assert.equal(
      resolve(paths.artifactPath),
      resolve(paths.functionTreePath, config.handler),
      'rollback handler path mismatch',
    );
    assert(
      config.runtime.startsWith('nodejs') &&
        config.supportsResponseStreaming === true,
      'rollback unsupported function config',
    );
    // Independent operator evidence binds an actual isolated compiled-artifact smoke result, not a toggle.
    const verification = await readFile(paths.verificationPath);
    assert.equal(
      sha256(verification),
      candidate.verificationSha256,
      'rollback isolated executable verification mismatch',
    );
    const actual = JSON.parse(verification);
    assert.deepEqual(
      actual,
      {
        sourceCommit: SOURCE,
        backend,
        artifactSha256: candidate.artifactSha256,
        functionTreeSha256: candidate.functionTreeSha256,
        outputTreeSha256: candidate.outputTreeSha256,
        lockSha256: candidate.lockSha256,
      },
      'rollback isolated artifact identity differs',
    );
  }
}

function counters(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(counters);
  if (!value || typeof value !== 'object') return null;
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, counters(item)])
      .filter(([, item]) => item !== null),
  );
}

/** Open actual guarded Postgres and bounded HTTP/SSE clients; fresh requests send no visitor cookie. */
export async function createRollbackIO(
  options,
  expected,
  plan,
  control,
  dependencies = {},
) {
  const context = await (dependencies.openContext ?? storageContext)(
    options,
    expected,
  );
  let saver, threads;
  const close = async () => {
    const errors = [];
    for (const resource of [saver, threads, context.database]) {
      if (!resource) continue;
      try {
        await timeoutBound(
          () => (resource.end ? resource.end() : resource.close()),
          { deadlineMs: Date.now() + 5000 },
        );
      } catch {
        errors.push('owned rollback resource close failed');
      }
    }
    assert.equal(errors.length, 0, errors.join('; '));
    assert.equal(
      context.databaseErrors?.length ?? 0,
      0,
      'database idle error observed',
    );
  };
  try {
    saver = context.storage.postgresCheckpointer({
      pool: context.database,
      tablePrefix: 'atc',
    });
    threads = context.storage.createPostgresThreadsStore({
      pool: context.database,
      tablePrefix: 'atc',
    });
    const schema = JSON.parse(await readFile(options.schemaPath, 'utf8'));
    assert.equal(
      sha256(await readFile(options.schemaPath)),
      expected.schemaSha256,
    );
    const Ajv =
      dependencies.Ajv ??
      createRequire(resolveRuntimeDependency(options.runtimeRoot, 'ajv'))(
        'ajv',
      );
    const validate = new Ajv({ strict: false }).compile(schema);
    let redact = context.redact;
    const query = (sql, values, bounds) =>
      timeoutBound(() => context.database.query(sql, values), bounds);
    const snapshot = async (bounds) => {
      const tables = await query(
        "select tablename from pg_tables where schemaname='public' and left(tablename,4)='atc_' order by tablename",
        [],
        bounds,
      );
      assert(tables.rows.length > 0, 'rollback B4 tables absent');
      const result = {};
      for (const { tablename } of tables.rows) {
        assert(/^atc_[a-z_]+$/.test(tablename));
        const rows = (
          await query('select * from "public"."' + tablename + '"', [], bounds)
        ).rows;
        result[tablename] = rows
          .map((row) => sha256(stableStringify(row)))
          .sort();
      }
      return result;
    };
    return {
      close,
      snapshot,
      get redact() {
        return redact;
      },
      waitQuiescent: async (bounds) => {
        const start = performance.now();
        await timeoutBound(
          (signal) => delay(75000, undefined, { signal }),
          bounds,
        );
        return performance.now() - start;
      },
      request: async (bounds) => {
        const runId = bounds.runId ?? randomUUID();
        bounds.onRequestObserved?.({ runId });
        const marker =
          'ROLLBACK' + randomUUID().replaceAll('-', '').toUpperCase();
        const body = {
          threadId: bounds.threadId,
          runId,
          messages: [
            {
              id: randomUUID(),
              role: 'user',
              content:
                'Define aircraft callsign in one short sentence beginning with reference marker ' +
                marker +
                '.',
            },
          ],
          tools: [],
          context: [],
          state: {},
          forwardedProps: { hashbrown: { responseSchema: schema } },
        };
        let text = '';
        const fragments = [];
        const secretValues = [
          ...Object.values(context.secrets),
          marker,
          body.messages[0].content,
        ];
        redact = (value) => context.redact(createRedactor(secretValues)(value));
        const events = [];
        const response = await timeoutBound(
          (signal) =>
            (dependencies.fetch ?? fetch)(
              'https://' + plan.alias + '/api/run',
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
                redirect: 'error',
                signal,
              },
            ),
          bounds,
        );
        const requestId = response.headers.get('x-vercel-id');
        bounds.onRequestObserved?.({
          runId,
          requestId,
          status: response.status,
        });
        assert.equal(
          response.status,
          200,
          'rollback unexpected HTTP error/throttle',
        );
        assert(requestId, 'rollback actual platform request ID missing');
        await timeoutBound(
          (signal) =>
            readSseStream(response, {
              signal,
              timeoutMs: Math.max(1, bounds.deadlineMs - Date.now()),
              runId,
              threadId: bounds.threadId,
              redact: (value) => redact(value),
              onEvent: (event) => {
                events.push(event);
                if (event.type === 'RUN_FINISHED')
                  bounds.onRequestObserved?.({
                    runId,
                    requestId,
                    status: response.status,
                    terminalUsage: counters(
                      event.usage ??
                        event.usageMetadata ??
                        event.usage_metadata,
                    ),
                    terminalModel: event.model ?? null,
                    terminalProviderResponseId:
                      event.responseId ?? event.providerResponseId ?? null,
                  });
                if (event.type === 'TEXT_MESSAGE_CONTENT') {
                  const delta = event.delta ?? '';
                  text += delta;
                  fragments.push(delta);
                  redact = (value) =>
                    context.redact(
                      createRedactor([...secretValues, text, ...fragments])(
                        value,
                      ),
                    );
                }
                assert(
                  event.type !== 'TOOL_CALL_START',
                  'unexpected rollback browser tool',
                );
              },
            }),
          bounds,
        );
        // First database operation after EOF must be the exact admission count.
        const canonical = await timeoutBound(
          () =>
            canonicalStorageSummary({
              pool: context.database,
              saver,
              threadStore: threads,
              threadId: bounds.threadId,
              tablePrefix: 'atc',
            }),
          bounds,
        );
        assert.equal(
          canonical.admissions,
          0,
          'first post-EOF admission must be zero',
        );
        assert(validate(JSON.parse(text)), 'rollback output schema mismatch');
        assert(
          text.includes(marker),
          'rollback response correlation marker mismatch',
        );
        assert(
          (text.match(/ROLLBACK[A-F0-9]{32}/g) ?? []).every(
            (value) => value === marker,
          ),
          'foreign rollback marker',
        );
        const tuple = await timeoutBound(
          () =>
            saver.getTuple({
              configurable: { thread_id: bounds.threadId, checkpoint_ns: '' },
            }),
          bounds,
        );
        const messages = tuple?.checkpoint.channel_values.messages ?? [];
        let providerUsage = null;
        if (bounds.backend === 'b4') {
          assert(
            response.headers
              .getSetCookie()
              .some((cookie) => cookie.startsWith('atc_visitor=')),
            'fresh B4 visitor cookie missing',
          );
          assert(canonical.threadPresent, 'B4 canonical thread absent');
          const ai = messages.filter((message) => message.type === 'ai');
          assert.equal(ai.length, 1, 'duplicate canonical B4 response');
          const human = messages.filter((message) => message.type === 'human');
          assert.equal(human.length, 1);
          const humanText =
            typeof human[0].content === 'string'
              ? human[0].content
              : human[0].content
                  .filter((part) => part.type === 'text')
                  .map((part) => part.text)
                  .join('');
          assert.equal(
            humanText,
            body.messages[0].content,
            'canonical rollback input mismatch',
          );
          assert.equal(ai[0].response_metadata?.max_output_tokens, 4096);
          const content =
            typeof ai[0].content === 'string'
              ? ai[0].content
              : ai[0].content
                  .filter((part) => part.type === 'text')
                  .map((part) => part.text)
                  .join('');
          assert.deepEqual(JSON.parse(content), JSON.parse(text));
          providerUsage = [
            {
              responseId: ai[0].response_metadata?.id ?? null,
              model:
                ai[0].response_metadata?.model_name ??
                ai[0].response_metadata?.model ??
                null,
              usage: counters(
                ai[0].usage_metadata ?? ai[0].response_metadata?.usage,
              ),
            },
          ];
        } else {
          assert.equal(
            messages.length,
            0,
            'OpenAI request wrote B4 checkpoint',
          );
        }
        // Exact deployment correlation must come from an independently reviewed platform request-log adapter.
        const route = await timeoutBound(
          (signal) =>
            dependencies.routeProof({
              ...bounds,
              signal,
              runId,
              requestId,
              alias: plan.alias,
            }),
          bounds,
        );
        assert(
          route?.source === 'owned-deployment-request-logs' &&
            route.deploymentId === bounds.deployment.id &&
            route.requestId === requestId &&
            route.runId === runId &&
            route.threadId === bounds.threadId &&
            route.alias === plan.alias,
          'rollback actual deployment proof missing',
        );
        const terminal = events.find((event) => event.type === 'RUN_FINISHED');
        return {
          terminalUsage: counters(
            terminal?.usage ??
              terminal?.usageMetadata ??
              terminal?.usage_metadata,
          ),
          terminalModel: terminal?.model ?? null,
          terminalProviderResponseId:
            terminal?.responseId ?? terminal?.providerResponseId ?? null,
          providerUsage,
          status: response.status,
          requestId,
          runId,
          threadId: bounds.threadId,
          deploymentId: route.deploymentId,
          backend: bounds.backend,
          outputSha256: sha256(text),
          markerSha256: sha256(marker),
          canonical,
          terminal: {
            type: events.find((event) => event.type === 'RUN_FINISHED')?.type,
            runId,
            threadId: bounds.threadId,
          },
        };
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}

/** Run the preview rehearsal through the fixed aggregate ledger and retain a sanitized partial receipt. */
export async function runRollbackCheck(options, expected, adapters) {
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      adapters.runId,
    ),
    'run UUID required',
  );
  const stage = await lstat(options.stagingDirectory);
  assert(
    stage.isDirectory() &&
      !stage.isSymbolicLink() &&
      (stage.mode & 0o777) === 0o700 &&
      stage.uid === process.getuid() &&
      (await realpath(options.stagingDirectory)) === options.stagingDirectory,
    'private staging directory required',
  );
  const receipt = { phase: 'rollback', status: 'incomplete', qualified: false };
  let io;
  let finalizeAlias;
  let redact = createRedactor([adapters.vercelToken]);
  try {
    assert(
      typeof adapters.vercelToken === 'string' && adapters.vercelToken.trim(),
      'Vercel management auth required',
    );
    const plan = expected.rollback;
    assert.equal(expected.sourceCommit, SOURCE, 'frozen source required');
    for (const key of [
      'sourceCommit',
      'artifactSha256',
      'functionTreeSha256',
      'outputTreeSha256',
      'lockSha256',
    ])
      assert.equal(
        plan.b4[key],
        expected[key],
        'rollback normal B4 context mismatch',
      );
    assert(
      expected.deployments.some((deployment) => deployment.id === plan.b4.id),
      'rollback normal B4 deployment mismatch',
    );
    assert.equal(plan.runId, adapters.runId);
    assert.equal(
      typeof adapters.routeProof,
      'function',
      'reviewed actual-route logs required',
    );
    await verifyRollbackArtifacts(options.artifacts, plan);
    const inventoryPath = join(
      options.stagingDirectory,
      'rollback-alias-' + adapters.runId + '.jsonl',
    );
    await writeFile(
      inventoryPath,
      JSON.stringify({ action: 'initial', plan }) + '\n',
      { mode: 0o600, flag: 'wx' },
    );
    const persist = async (row) => {
      const file = await open(inventoryPath, 'a');
      try {
        await file.writeFile(JSON.stringify(row) + '\n');
        await file.sync();
      } finally {
        await file.close();
      }
    };
    const alias = createVercelAlias({
      token: adapters.vercelToken,
      plan,
      persist,
    });
    await withRolloutRun(
      options.stagingDirectory,
      adapters.expectedBudget,
      {
        phase: 'rollback',
        runId: adapters.runId,
        observationSource: adapters.observationSource,
        cleanup: async () => {
          const errors = [];
          if (finalizeAlias) {
            try {
              await timeoutBound(() => finalizeAlias(), {
                deadlineMs: Date.now() + 55000,
              });
            } catch {
              errors.push('owned alias restoration/removal failed');
            }
          }
          if (io) {
            try {
              await io.close();
            } catch {
              errors.push('owned HTTP/storage cleanup failed');
            }
          }
          receipt.cleanupErrors = errors;
          assert.equal(errors.length, 0, errors.join('; '));
          receipt.closed = true;
        },
      },
      async (control) => {
        receipt.deployments = [];
        for (const candidate of [plan.b4, plan.openai])
          receipt.deployments.push(
            await alias.verifyDeployment(candidate, control),
          );
        io = await createRollbackIO(options, expected, plan, control, {
          routeProof: adapters.routeProof,
        });
        const secretRedactor = redact;
        redact = (value) => secretRedactor(io.redact(value));
        await runRollbackProtocol({
          plan,
          control,
          alias,
          io,
          receipt,
          registerCleanup: (cleanup) => {
            finalizeAlias = cleanup;
          },
        });
      },
    );
    receipt.status = receipt.qualified ? 'qualified' : 'inconclusive';
  } catch (error) {
    receipt.status = 'failed';
    receipt.qualified = false;
    receipt.error = error.message;
  }
  const sanitized = redact(receipt);
  await writeFile(
    join(options.stagingDirectory, 'rollback-' + adapters.runId + '.json'),
    JSON.stringify(sanitized, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  return sanitized;
}
