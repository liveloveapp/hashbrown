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
import { createReceiptRedactor } from './receipt-redaction.mjs';
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
        (!Object.hasOwn(value, 'teamId') || value.teamId === plan.ownerId) &&
        (!Object.hasOwn(value, 'team') || value.team?.id === plan.ownerId),
      'rollback alias identity mismatch',
    );
    const deploymentId = value.deploymentId ?? value.deployment?.id;
    assert(
      [plan.b4.id, plan.openai.id].includes(deploymentId),
      'rollback alias maps to unexpected deployment',
    );
    // Alias responses can omit team fields. Require fresh authenticated project ownership.
    // This metadata request never uses an environment/decryption endpoint or reads env fields.
    const project = await api(
      '/v9/projects/' + encodeURIComponent(plan.projectId),
      'GET',
      bounds,
    );
    assert(
      project &&
        project.id === plan.projectId &&
        project.id === value.projectId &&
        project.accountId === plan.ownerId,
      'rollback alias project ownership mismatch',
    );
    return {
      aliasId: value.uid,
      alias: value.alias,
      deploymentId,
      projectId: value.projectId,
      ownerId: project.accountId,
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

function assertOwnedAlias(snapshot, plan) {
  assert(
    snapshot &&
      snapshot.aliasId === plan.aliasId &&
      snapshot.alias === plan.alias &&
      snapshot.projectId === plan.projectId &&
      snapshot.ownerId === plan.ownerId,
    'rollback alias identity mismatch during ownership verification',
  );
  assert(
    [plan.b4.id, plan.openai.id].includes(snapshot.deploymentId),
    'rollback alias maps to unexpected deployment',
  );
}

/** Own the precreated test alias before fallible work; independently reverify identity during cleanup. */
function createAliasCleanup(plan, alias, receipt) {
  validateRollbackPlan(plan);
  let pending;
  receipt.aliasRemoved = false;
  const cleanup = async () => {
    const bounds = {
      signal: new AbortController().signal,
      deadlineMs: Date.now() + 55000,
    };
    try {
      const current = await timeoutBound(() => alias.inspect(bounds), bounds);
      assertOwnedAlias(current, plan);
      if (current.deploymentId !== plan.initialDeploymentId)
        await timeoutBound(
          () => alias.assign(plan.initialDeploymentId, bounds),
          bounds,
        );
      receipt.restored = await timeoutBound(
        () => alias.inspect(bounds),
        bounds,
      );
      assertOwnedAlias(receipt.restored, plan);
      assert.equal(
        receipt.restored.deploymentId,
        plan.initialDeploymentId,
        'rollback restoration missing',
      );
      await timeoutBound(() => alias.remove(bounds), bounds);
      receipt.aliasRemoved = true;
    } catch (error) {
      receipt.aliasCleanupError =
        'owned alias identity/restoration/removal failed';
      throw error;
    }
  };
  return () => (pending ??= cleanup());
}

/** Rehearse two fresh visitor requests within the four-reservation cap; restore and verify before deletion. */
export async function runRollbackProtocol({
  plan,
  control,
  alias,
  io,
  receipt = {},
  registerCleanup,
  cleanupAlias,
}) {
  validateRollbackPlan(plan);
  receipt.qualified = false;
  receipt.attempts = [];
  receipt.threadIds = [];
  receipt.limitations = {
    existingConversations:
      'B4 threads cannot transparently continue as durable B4 threads on direct OpenAI',
  };
  const finalizeAlias =
    cleanupAlias ?? createAliasCleanup(plan, alias, receipt);
  registerCleanup?.(finalizeAlias);
  try {
    const initial = await alias.inspect(control);
    assertOwnedAlias(initial, plan);
    assert.equal(
      initial.deploymentId,
      plan.initialDeploymentId,
      'rollback initial mapping mismatch',
    );
    receipt.initial = initial;
    for (const backend of ['b4', 'openai']) {
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

/**
 * Open guarded Postgres and bounded HTTP/SSE clients; fresh requests send no visitor cookie.
 * @remarks
 * Aborted or expired initialization returns no IO. Late contexts remain owned and are closed.
 * A rejection with `cleanupFailed` retains unresolved/failed initialization cleanup for follow-up.
 */
export async function createRollbackIO(
  options,
  expected,
  plan,
  control,
  dependencies = {},
) {
  let context, saver, threads, opening, closing;
  const close = () =>
    (closing ??= (async () => {
      const errors = [];
      for (const resource of [saver, threads, context?.database]) {
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
        context?.databaseErrors?.length ?? 0,
        0,
        'database idle error observed',
      );
    })());
  try {
    await timeoutBound(() => undefined, control);
    opening = Promise.resolve()
      .then(() =>
        (dependencies.openContext ?? storageContext)(options, expected),
      )
      .then(async (opened) => {
        // Keep ownership in this continuation even when the caller's deadline wins the race.
        context = opened;
        if (control.signal.aborted || Date.now() >= control.deadlineMs) {
          await close();
          throw Error('rollback initialization exceeded phase control');
        }
        return opened;
      });
    opening.catch(() => undefined);
    context = await timeoutBound(() => opening, control);
    saver = context.storage.postgresCheckpointer({
      pool: context.database,
      tablePrefix: 'atc',
    });
    threads = context.storage.createPostgresThreadsStore({
      pool: context.database,
      tablePrefix: 'atc',
    });
    const schemaBytes = await timeoutBound(
      () => readFile(options.schemaPath),
      control,
    );
    const schema = JSON.parse(schemaBytes);
    assert.equal(sha256(schemaBytes), expected.schemaSha256);
    const Ajv =
      dependencies.Ajv ??
      createRequire(resolveRuntimeDependency(options.runtimeRoot, 'ajv'))(
        'ajv',
      );
    const validate = new Ajv({ strict: false }).compile(schema);
    const modelText = [];
    const cookies = [];
    const credentialValues = () => [
      ...Object.values(context.secrets),
      ...cookies,
    ];
    const redactCredentials = (value) =>
      context.redact(createRedactor(credentialValues())(value));
    const redact = createReceiptRedactor({
      redactCredentials,
      modelText: () => modelText,
    });
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
    await timeoutBound(() => undefined, control);
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
        modelText.push(marker, body.messages[0].content);
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
        for (const header of response.headers.getSetCookie()) {
          const pair = header.split(';')[0];
          cookies.push(pair, pair.slice(pair.indexOf('=') + 1));
        }
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
              redact: redactCredentials,
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
                  modelText.push(delta);
                }
                assert(
                  event.type !== 'TOOL_CALL_START',
                  'unexpected rollback browser tool',
                );
              },
            }),
          bounds,
        );
        modelText.push(text);
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
    let cleanupFailed = false;
    if (opening) {
      try {
        await timeoutBound(
          () =>
            opening.then(
              () => undefined,
              () => undefined,
            ),
          { deadlineMs: Date.now() + 5000 },
        );
      } catch {
        cleanupFailed = true;
      }
    }
    if (context) {
      try {
        await close();
      } catch {
        cleanupFailed = true;
      }
    }
    if (cleanupFailed)
      throw Object.assign(
        Error('partial rollback initialization cleanup failed'),
        { cleanupFailed: true, cause: error },
      );
    throw error;
  }
}

/** Run the preview rehearsal through the fixed aggregate ledger and retain a sanitized partial receipt. */
export async function runRollbackCheck(
  options,
  expected,
  adapters,
  dependencies = {},
) {
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
  const receipt = {
    phase: 'rollback',
    status: 'incomplete',
    qualified: false,
    closed: false,
  };
  let io;
  let finalizeAlias;
  let initializingIO;
  let initializationCleanupFailed = false;
  let cleanupPromise;
  const cleanupOwned = () =>
    (cleanupPromise ??= (async () => {
      const errors = [];
      if (initializingIO) {
        try {
          await timeoutBound(
            () =>
              initializingIO.then(
                () => undefined,
                () => undefined,
              ),
            { deadlineMs: Date.now() + 55000 },
          );
        } catch {
          errors.push('owned rollback initialization still unresolved');
        }
      }
      if (initializationCleanupFailed)
        errors.push('partial rollback initialization cleanup failed');
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
    })());
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
    const alias = (dependencies.createAlias ?? createVercelAlias)({
      token: adapters.vercelToken,
      plan,
      persist,
    });
    finalizeAlias = createAliasCleanup(plan, alias, receipt);
    await (dependencies.withRun ?? withRolloutRun)(
      options.stagingDirectory,
      adapters.expectedBudget,
      {
        phase: 'rollback',
        runId: adapters.runId,
        observationSource: adapters.observationSource,
        cleanup: cleanupOwned,
      },
      async (control) => {
        await (dependencies.verifyArtifacts ?? verifyRollbackArtifacts)(
          options.artifacts,
          plan,
        );
        receipt.deployments = [];
        for (const candidate of [plan.b4, plan.openai])
          receipt.deployments.push(
            await alias.verifyDeployment(candidate, control),
          );
        initializingIO = Promise.resolve()
          .then(() =>
            (dependencies.createIO ?? createRollbackIO)(
              options,
              expected,
              plan,
              control,
              { routeProof: adapters.routeProof },
            ),
          )
          .then((opened) => {
            io = opened;
            return opened;
          })
          .catch((error) => {
            initializationCleanupFailed = error.cleanupFailed === true;
            throw error;
          });
        initializingIO.catch(() => undefined);
        await initializingIO;
        const secretRedactor = redact;
        redact = (value) => secretRedactor(io.redact(secretRedactor(value)));
        await runRollbackProtocol({
          plan,
          control,
          alias,
          io,
          receipt,
          cleanupAlias: finalizeAlias,
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
  } finally {
    if (finalizeAlias) {
      try {
        await cleanupOwned();
      } catch (error) {
        receipt.status = 'failed';
        receipt.qualified = false;
        receipt.error ??= error.message;
      }
    }
  }
  const sanitized = redact(receipt);
  await writeFile(
    join(options.stagingDirectory, 'rollback-' + adapters.runId + '.json'),
    JSON.stringify(sanitized, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  return sanitized;
}
