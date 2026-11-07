import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
  assertLoadedSdkIdentity,
  validateStaticRoot,
} from './candidate-contract.mjs';
import { digest, options, run } from './consumer.mjs';
import { verifyPrepared } from './verify-candidate.mjs';

/** Runs real Kestrel/PostgreSQL/installed-client journeys against a strict native Responses upstream. */
export async function smoke(selection) {
  const metadata = await verifyPrepared(selection.metadata);
  const connection = process.env.DOTNET_TEST_POSTGRES;
  assert.ok(
    connection,
    'Explicit DOTNET_TEST_POSTGRES is required; no in-memory journal fallback.',
  );
  let upstream;
  let browser;
  let receipt;
  let primaryFailure;
  let cleanupFailure;
  let failed = false;
  const deadline = new AbortController();
  const abortOwned = () => {
    void browser?.close().catch(() => undefined);
    void worker?.stop().catch(() => undefined);
  };
  deadline.signal.addEventListener('abort', abortOwned, { once: true });
  const deadlineTimer = setTimeout(
    () =>
      deadline.abort(Error('Starter smoke exceeded its 900-second run bound.')),
    900000,
  );
  const wait = (condition, milliseconds = 60000) =>
    until(condition, milliseconds, deadline.signal);
  const evidence = [];
  const schemas = [];
  let worker;
  try {
    upstream = await strictResponses();
    deadline.signal.throwIfAborted();
    browser = await chromium.launch({ headless: true });
    deadline.signal.throwIfAborted();
    for (const framework of ['react', 'angular']) {
      const requestStart = upstream.requests.length;
      const schema = 'starter_smoke_' + randomBytes(12).toString('hex');
      schemas.push(schema);
      const staticRoot = await validateStaticRoot(metadata.root, framework);
      const origin = await availableOrigin();
      const environment = {
        ...metadata.environment,
        ASPNETCORE_ENVIRONMENT: 'Development',
        DevelopmentIdentityEnabled: 'true',
        LocalOrigin: origin,
        ClientRoot: staticRoot,
        ConnectionStrings__NativeJournal: connection,
        NativeSchema: schema,
        Provider: 'openai',
        ModelEndpoint: upstream.url + '/v1/',
        Model: 'starter-smoke',
        ModelApi: 'responses',
        ApiKey: 'starter-smoke-canary',
      };
      await refusesStartup(
        metadata,
        { ...environment, ASPNETCORE_ENVIRONMENT: 'Production' },
        'authentication',
      );
      await refusesStartup(
        metadata,
        { ...environment, DevelopmentIdentityEnabled: 'false' },
        'Development',
      );
      worker = await startWorker(
        metadata,
        environment,
        `${framework}-first`,
        deadline.signal,
      );
      assertWitness(metadata, worker.witness);
      const beforeRefusals = upstream.requests.length;
      for (const headers of [
        { Host: 'attacker.invalid' },
        { Origin: 'https://attacker.invalid' },
        { Origin: 'null' },
        { 'Hashbrown-Scope': 'forged' },
        {},
      ]) {
        const status = await unsafeRequest(origin, headers);
        assert.equal(
          status,
          401,
          'Unsafe requests must fail before provider work.',
        );
      }
      assert.equal(
        upstream.requests.length,
        beforeRefusals,
        'Authentication refusal dispatched model work.',
      );
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      const diagnostic = {
        root: metadata.root,
        framework,
        errors,
        logErrors: [],
      };
      const errorLog = path.join(
        metadata.root,
        'logs',
        'browser-errors-' + framework + '.jsonl',
      );
      await fs.writeFile(errorLog, '');
      page.on('pageerror', (error) => {
        if (errors.length >= 20) return;
        const record = {
          name: String(error.name).slice(0, 128),
          message: String(error.message).slice(0, 2048),
          stack: String(error.stack ?? '').slice(0, 8192),
        };
        errors.push(record);
        void fs
          .appendFile(errorLog, JSON.stringify(record) + '\n')
          .catch((error) => diagnostic.logErrors.push(error.name));
      });
      await page.goto(origin);
      await page
        .getByRole('heading', {
          name: `Hashbrown .NET starter · ${framework === 'react' ? 'React' : 'Angular'}`,
        })
        .waitFor();
      await send(page, 'starter-smoke-approval');
      await page.getByTestId('approval-approve').waitFor();
      await page.getByTestId('approval-approve').click();
      await done(page, 'starter-smoke-approval', deadline.signal, diagnostic);
      assertOriginalResults(
        upstream.requests,
        'starter-smoke-approval',
        ['native'],
        { requestStart },
      );
      await page
        .getByRole('button', { name: 'New conversation', exact: true })
        .click();
      const warmBrowserBeforeEntries = await page.evaluate(() =>
        Number(sessionStorage.getItem('starter-browser-entries') ?? '0'),
      );
      await send(page, 'starter-smoke-browser');
      await page.getByTestId('browser-release').waitFor({ state: 'visible' });
      let warmEntryWitness;
      await wait(async () => {
        warmEntryWitness = {
          beforeEntries: warmBrowserBeforeEntries,
          afterEntries: await page.evaluate(() =>
            Number(sessionStorage.getItem('starter-browser-entries') ?? '0'),
          ),
          pending: await page.getByTestId('browser-release').isEnabled(),
        };
        return (
          warmEntryWitness.pending &&
          Number.isSafeInteger(warmEntryWitness.afterEntries) &&
          warmEntryWitness.afterEntries > warmBrowserBeforeEntries
        );
      });
      assertBrowserEntered(warmEntryWitness);
      await page
        .getByTestId('note')
        .fill('<img src=x onerror=alert(1)> known browser note');
      await page.getByTestId('browser-release').click();
      await done(page, 'starter-smoke-browser', deadline.signal, diagnostic);
      assertOriginalResults(
        upstream.requests,
        'starter-smoke-browser',
        ['browser'],
        {
          requestStart,
          browserOutcome: 'known',
          browserValue: {
            note: '<img src=x onerror=alert(1)> known browser note',
          },
        },
      );
      assert.equal(
        await page.locator('img').count(),
        0,
        'Messages must be escaped.',
      );
      await page
        .getByRole('button', { name: 'New conversation', exact: true })
        .click();
      await send(page, 'starter-smoke-decline');
      await page.getByTestId('approval-decline').waitFor();
      await page.getByTestId('approval-decline').click();
      await done(page, 'starter-smoke-decline', deadline.signal, diagnostic);
      await page
        .getByRole('button', { name: 'New conversation', exact: true })
        .click();
      const abortStart = upstream.interruptions();
      await send(page, 'starter-smoke-interrupt');
      await wait(async () =>
        upstream.requests
          .slice(requestStart)
          .some((item) => item.scenario === 'starter-smoke-interrupt'),
      );
      await page.getByTestId('stop').click();
      await wait(async () => upstream.interruptions() > abortStart);
      await page
        .getByRole('button', { name: 'New conversation', exact: true })
        .click();

      for (const outcome of ['known', 'unavailable']) {
        const scenario = `starter-smoke-cold-${outcome}`;
        const beforeEntries = await page.evaluate(() =>
          Number(sessionStorage.getItem('starter-browser-entries') ?? '0'),
        );
        if (outcome === 'known')
          await page
            .getByTestId('note')
            .fill('<script>known cold browser state</script>');
        const knownNote = await page.getByTestId('note').inputValue();
        let configuration;
        const capture = (request) => {
          if (
            new URL(request.url()).pathname !== '/run' ||
            request.method() !== 'POST'
          )
            return;
          configuration = captureRecoveryConfiguration(
            configuration,
            request.postDataJSON(),
          );
        };
        page.on('request', capture);
        await send(page, scenario);
        await wait(
          async () =>
            !!configuration &&
            upstream.requests
              .slice(requestStart)
              .some((item) => item.scenario === scenario),
        );
        const selectedUrl = page.url();
        const threadId = new URL(selectedUrl).searchParams.get('threadId');
        assert.ok(
          threadId,
          'Explicit public selector must survive cold reload.',
        );
        let pending;
        await wait(async () => {
          pending = await recovery(origin, threadId, configuration);
          return (
            pending?.disposition === 'Pending' &&
            pending.snapshot?.pendingBrowserRecovery?.callIds?.length === 1
          );
        });
        assert.ok(
          pending.snapshot.interrupts?.length > 0,
          'Cold work must contain genuine protected approval.',
        );
        await page
          .getByRole('heading', { name: 'Native approval', exact: true })
          .waitFor();
        assertBrowserInert({
          beforeEntries,
          afterEntries: await page.evaluate(() =>
            Number(sessionStorage.getItem('starter-browser-entries') ?? '0'),
          ),
          pending: await page.getByTestId('browser-release').isEnabled(),
        });
        const beforeCold = await inspectDatabase(metadata, schema, connection);
        const entries = await page.evaluate(() =>
          sessionStorage.getItem('starter-browser-entries'),
        );
        await page.goto('about:blank');
        const priorPid = worker.pid;
        await worker.stop();
        worker = undefined;
        await verifyPrepared(selection.metadata);
        worker = await startWorker(
          metadata,
          environment,
          `${framework}-${outcome}-replacement`,
          deadline.signal,
        );
        assert.notEqual(
          worker.pid,
          priorPid,
          'Cold recovery must use a distinct worker process.',
        );
        assertWitness(metadata, worker.witness);
        const callsBeforeRestore = upstream.requests.length;
        await page.goto(selectedUrl);
        await page.getByTestId('recover').click();
        await page
          .getByRole('heading', { name: 'Recovered browser work', exact: true })
          .waitFor();
        assert.equal(
          upstream.requests.length,
          callsBeforeRestore,
          'Read-only recovery dispatched model work.',
        );
        assertBrowserInert({
          beforeEntries: Number(entries),
          afterEntries: await page.evaluate(() =>
            Number(sessionStorage.getItem('starter-browser-entries') ?? '0'),
          ),
          pending: await page.getByTestId('browser-release').isEnabled(),
        });
        if (outcome === 'known') {
          await page.getByTestId('recovery-outcome').selectOption('result');
          await page
            .getByTestId('recovery-json')
            .fill(JSON.stringify({ note: knownNote }));
        }
        await page.getByTestId('settle-approve').click();
        await done(page, scenario, deadline.signal, diagnostic);
        assertBrowserInert({
          beforeEntries,
          afterEntries: await page.evaluate(() =>
            Number(sessionStorage.getItem('starter-browser-entries') ?? '0'),
          ),
          pending: await page.getByTestId('browser-release').isEnabled(),
        });
        assertOriginalResults(
          upstream.requests,
          scenario,
          ['native', 'browser'],
          {
            requestStart,
            browserOutcome: outcome,
            browserValue: outcome === 'known' ? { note: knownNote } : undefined,
          },
        );
        assert.equal(
          await page.locator('script:not([src])').count(),
          0,
          'Diagnostics must be escaped.',
        );
        const afterCold = await inspectDatabase(metadata, schema, connection);
        assert.equal(
          afterCold.completed,
          beforeCold.completed + 1,
          'The original native call must settle once.',
        );
        assert.equal(
          afterCold.dispatching,
          0,
          'No native call may remain dispatching.',
        );
        const inertCalls = upstream.requests.length;
        const completed = await completedRecovery(
          origin,
          threadId,
          configuration,
          deadline.signal,
        );
        const repeated = await completedRecovery(
          origin,
          threadId,
          configuration,
          deadline.signal,
        );
        assert.equal(
          completed.disposition,
          'Completed',
          'Authoritative continuation must be Completed.',
        );
        assert.equal(
          repeated.disposition,
          'Completed',
          'Repeated recovery must retain authoritative Completed state.',
        );
        assert.equal(
          upstream.requests.length,
          inertCalls,
          'Repeated Completed reads dispatched provider work.',
        );
        assert.deepEqual(
          await inspectDatabase(metadata, schema, connection),
          afterCold,
          'Repeated recovery redispatched native effects.',
        );
        evidence.push({
          framework,
          scenario,
          firstPid: priorPid,
          replacementPid: worker.pid,
          pendingRevision: pending.serverRevision,
          completedRevision: completed.serverRevision,
          originalCallResults: true,
          originalBrowserHandlerEntered: false,
          browserInertUntilSettlement: true,
          noBrowserReplay: true,
          browserOutcomeSource:
            outcome === 'known'
              ? 'captured-browser-note-state'
              : 'explicit-unavailable-observation',
          nativeCompletedDelta: afterCold.completed - beforeCold.completed,
        });
        page.off('request', capture);
        await page
          .getByRole('button', { name: 'New conversation', exact: true })
          .click();
      }
      assert.equal(
        errors.length,
        0,
        'Actual framework client emitted page errors.',
      );
      await context.close();
      await worker.stop();
      worker = undefined;
      await cleanupDatabase(metadata, schema, connection);
      schemas.splice(schemas.indexOf(schema), 1);
    }
    assert.equal(
      upstream.errors.length,
      0,
      'Strict Responses request validation failed.',
    );
    await verifyPrepared(selection.metadata);
    deadline.signal.throwIfAborted();
    receipt = {
      schema: 1,
      kind: 'starter-source-candidate-smoke',
      sourceSha256: digest(JSON.stringify(metadata.sources)),
      frameworks: ['react', 'angular'],
      journeys: evidence,
      providerCalls: upstream.requests.length,
      cleanup: true,
    };
  } catch (error) {
    failed = true;
    primaryFailure = error;
  } finally {
    clearTimeout(deadlineTimer);
    deadline.signal.removeEventListener('abort', abortOwned);
    try {
      await cleanupResources([
        async () => worker?.stop(),
        async () => browser?.close(),
        async () => upstream?.close(),
        ...schemas.map(
          (schema) => async () => cleanupDatabase(metadata, schema, connection),
        ),
      ]);
    } catch (error) {
      cleanupFailure = error;
    }
  }
  if (failed && cleanupFailure)
    throw new AggregateError(
      [primaryFailure, ...cleanupFailure.errors],
      'Starter smoke failed and owned resource cleanup also failed.',
    );
  if (failed) throw primaryFailure;
  if (cleanupFailure) throw cleanupFailure;
  await fs.writeFile(
    path.join(metadata.root, 'logs/starter-smoke.json'),
    JSON.stringify(receipt, null, 2) + '\n',
  );
  console.log(JSON.stringify(receipt));
  return receipt;
}

/** Captures only the first normal request configuration, never transient continuation properties. */
export function captureRecoveryConfiguration(current, body) {
  if (
    current !== undefined ||
    (Array.isArray(body.resume) && body.resume.length > 0)
  )
    return current;
  return structuredClone({
    system: body.messages.find((message) => message.role === 'system')?.content,
    tools: body.tools,
    forwardedProps: body.forwardedProps ?? body.forwardedProperties ?? {},
  });
}

/** Requires a live pending browser read and a positive original-handler entry delta. */
export function assertBrowserEntered(witness) {
  assert.ok(
    witness &&
      Number.isSafeInteger(witness.beforeEntries) &&
      witness.beforeEntries >= 0 &&
      Number.isSafeInteger(witness.afterEntries) &&
      witness.afterEntries > witness.beforeEntries &&
      witness.pending === true,
    'Original browser handler entry and pending work must be positively observed before cold abandonment.',
  );
}

/** Requires observed unchanged browser handler counts and a disabled original browser operation. */
export function assertBrowserInert(witness) {
  assert.ok(
    witness &&
      Number.isSafeInteger(witness.beforeEntries) &&
      witness.beforeEntries >= 0 &&
      Number.isSafeInteger(witness.afterEntries) &&
      witness.afterEntries === witness.beforeEntries &&
      witness.pending === false,
    'Protected browser work must remain inert with observed unchanged entry counts.',
  );
}

/** Attempts every acquired cleanup in dependency order and reports all failures. */
export async function cleanupResources(cleanups) {
  const failures = [];
  for (const cleanup of cleanups) {
    try {
      await cleanup();
    } catch {
      failures.push(Error('Owned starter resource cleanup failed.'));
    }
  }
  if (failures.length)
    throw new AggregateError(failures, 'Owned starter cleanup failed.');
}

async function send(page, prompt) {
  await page.getByTestId('prompt').fill(prompt);
  await page.getByTestId('send').click();
}
async function done(page, scenario, signal, diagnostic) {
  try {
    await until(
      async () =>
        (await page.getByTestId('messages').textContent()).includes(
          'done ' + scenario,
        ),
      60000,
      signal,
    );
  } catch (error) {
    const bodyText = await page
      .locator('body')
      .innerText({ timeout: 1000 })
      .then(
        (text) => text.slice(0, 8192),
        () => '<body unavailable>',
      );
    const file = path.join(
      diagnostic.root,
      'logs',
      'browser-failure-' + diagnostic.framework + '-' + scenario + '.json',
    );
    try {
      await fs.writeFile(
        file,
        JSON.stringify(
          {
            phase: 'waiting-for-final-message',
            framework: diagnostic.framework,
            scenario,
            url: page.url().slice(0, 2048),
            bodyText,
            pageErrors: diagnostic.errors,
            diagnosticLogErrors: diagnostic.logErrors,
          },
          null,
          2,
        ) + '\n',
      );
    } catch (diagnosticError) {
      throw new AggregateError(
        [error, diagnosticError],
        'Starter final-message wait failed and its bounded diagnostic could not be written.',
      );
    }
    console.error('STARTER_BROWSER_DIAGNOSTIC ' + file);
    throw error;
  }
}
async function until(condition, milliseconds = 60000, signal) {
  const end = performance.now() + milliseconds;
  while (performance.now() < end) {
    signal?.throwIfAborted();
    if (await condition()) return;
    await delay(50);
  }
  throw Error('Bounded starter smoke condition timed out.');
}
async function availableOrigin() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return `http://127.0.0.1:${port}`;
}
async function unsafeRequest(origin, headers) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      origin + '/run',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        timeout: 5000,
      },
      (response) => {
        response.resume();
        response.once('end', () => resolve(response.statusCode));
      },
    );
    request.once('error', reject);
    request.once('timeout', () =>
      request.destroy(Error('Unsafe request timed out.')),
    );
    request.end('{}');
  });
}
async function recovery(origin, threadId, configuration) {
  const response = await fetch(
    `${origin}/threads/${encodeURIComponent(threadId)}/recovery`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Hashbrown-Recovery-Version': '2',
        'Hashbrown-Starter': 'starter',
      },
      body: JSON.stringify(configuration),
      signal: AbortSignal.timeout(5000),
    },
  );
  if (response.status === 503) return undefined;
  if (response.status === 409)
    throw Error('Actual native recovery configuration conflict (409).');
  assert.equal(response.status, 200, 'Actual native recovery request refused.');
  return response.json();
}
/** Waits only through bounded availability/publication races; permanent conflicts remain errors. */
async function completedRecovery(origin, threadId, configuration, signal) {
  let completed;
  await until(
    async () => {
      const observed = await recovery(origin, threadId, configuration);
      if (!observed || observed.disposition === 'Busy') return false;
      assert.equal(
        observed.disposition,
        'Completed',
        'Native recovery must adopt authoritative Completed state.',
      );
      completed = observed;
      return true;
    },
    60000,
    signal,
  );
  return completed;
}

function assertWitness(metadata, witness) {
  assert.ok(
    Number.isSafeInteger(witness?.processId) && witness.processId > 0,
    'Actual application startup witness required.',
  );
  assertLoadedSdkIdentity({
    ...witness,
    packageVersion: metadata.nuget.identity.version,
    archiveDllSha256: metadata.nuget.archiveDllSha256,
    outputDllSha256: metadata.nuget.archiveDllSha256,
  });
}
async function database(metadata, schema, connection, operation) {
  const output = await run(
    'dotnet',
    [
      path.join(metadata.root, 'tests/bin/Release/net10.0/Starter.Tests.dll'),
      path.join(metadata.root, 'server/bin/Release/net10.0/Starter.dll'),
      'database',
      operation,
      schema,
    ],
    metadata.root,
    { ...metadata.environment, STARTER_SMOKE_DATABASE: connection },
    `database-${operation}-${schema}.log`,
  );
  return JSON.parse(output.trim().split('\n').at(-1));
}
const inspectDatabase = (metadata, schema, connection) =>
  database(metadata, schema, connection, 'inspect');
const cleanupDatabase = (metadata, schema, connection) =>
  database(metadata, schema, connection, 'cleanup');
/** Requires original call identities and exact known/uncertain result payloads in actual provider input. */
export function assertOriginalResults(
  requests,
  scenario,
  kinds,
  expected = {},
) {
  const matching = requests
    .slice(expected.requestStart ?? 0)
    .filter((item) => item.scenario === scenario);
  assert.equal(
    matching.length,
    2,
    'Journey must have one original model turn and one continuation.',
  );
  const input = matching[1].body.input;
  assert.ok(
    Array.isArray(input),
    'Actual subsequent provider input is missing.',
  );
  for (const kind of kinds) {
    const callId = scenario + '-' + kind;
    assert.equal(
      input.filter(
        (item) => item.type === 'function_call' && item.call_id === callId,
      ).length,
      1,
      'Original model call must appear once in actual subsequent provider input.',
    );
    const results = input.filter(
      (item) => item.type === 'function_call_output' && item.call_id === callId,
    );
    assert.equal(
      results.length,
      1,
      'Original call result must appear once in actual subsequent provider input.',
    );
    let result;
    try {
      result = JSON.parse(results[0].output);
    } catch {
      throw Error('Actual provider result payload must contain JSON.');
    }
    if (kind === 'native') {
      assert.deepEqual(
        result,
        {
          code: 'SFO',
          name: 'San Francisco International Airport',
          city: 'San Francisco',
        },
        'Actual native airport result payload differs.',
      );
    } else if (expected.browserOutcome === 'known') {
      assert.deepEqual(
        result,
        expected.browserValue,
        'Actual known browser result payload differs.',
      );
    } else {
      assert.equal(
        expected.browserOutcome,
        'unavailable',
        'Explicit expected browser result outcome required.',
      );
      assert.deepEqual(
        result,
        {
          hashbrownRecovery: {
            version: 1,
            status: 'result-unavailable',
            effect: 'unknown',
            message:
              'The browser result is unavailable after recovery. The operation may already have occurred. No retry was performed.',
          },
        },
        'Explicit unavailable uncertainty result payload differs.',
      );
    }
  }
}

async function refusesStartup(metadata, environment, expected) {
  const child = spawn(
    'dotnet',
    [path.join(metadata.root, 'server/bin/Release/net10.0/Starter.dll')],
    {
      cwd: path.join(metadata.root, 'server'),
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const exited = once(child, 'exit');
  const timeout = setTimeout(() => child.kill('SIGKILL'), 10000);
  try {
    const [code] = await exited;
    assert.notEqual(code, 0, 'Unsafe startup must fail.');
    assert.ok(
      output.includes(expected),
      'Unsafe startup must explain missing authentication configuration.',
    );
  } finally {
    clearTimeout(timeout);
  }
}
async function startWorker(metadata, environment, label, signal) {
  signal?.throwIfAborted();
  const log = await fs.open(
    path.join(metadata.root, 'logs', `server-${label}.log`),
    'w',
  );
  const child = spawn(
    'dotnet',
    [path.join(metadata.root, 'server/bin/Release/net10.0/Starter.dll')],
    {
      cwd: path.join(metadata.root, 'server'),
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const exited = once(child, 'exit');
  let output = '';
  const record = (chunk) => {
    output += chunk;
    void log.write(chunk);
  };
  child.stdout.on('data', record);
  child.stderr.on('data', record);
  let stopping;
  const stop = () =>
    (stopping ??= (async () => {
      if (child.exitCode === null) child.kill('SIGINT');
      const timeout = setTimeout(() => child.kill('SIGKILL'), 10000);
      try {
        const [, signal] = await exited;
        assert.notEqual(
          signal,
          'SIGKILL',
          'Owned worker failed graceful drain.',
        );
      } finally {
        clearTimeout(timeout);
        await log.close();
        signal?.removeEventListener('abort', abort);
      }
    })());
  const abort = () => {
    void stop().catch(() => undefined);
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    await until(
      async () => {
        assert.equal(
          child.exitCode,
          null,
          'Actual starter process exited before readiness.',
        );
        return fetch(environment.LocalOrigin + '/health', {
          signal: AbortSignal.timeout(1000),
        }).then(
          (response) => response.ok,
          () => false,
        );
      },
      30000,
      signal,
    );
    const line = output
      .split('\n')
      .find((item) => item.includes('Loaded SDK witness '));
    assert.ok(line, 'Actual app did not report loaded SDK witness.');
    const witness = JSON.parse(
      line.slice(
        line.indexOf('Loaded SDK witness ') + 'Loaded SDK witness '.length,
      ),
    );
    assert.equal(
      witness.processId,
      child.pid,
      'Runtime witness came from another process.',
    );
    return { pid: child.pid, witness, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
async function strictResponses() {
  const requests = [];
  const errors = [];
  let interruptions = 0;
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.method, 'POST');
      assert.equal(request.url, '/v1/responses');
      assert.equal(
        request.headers.authorization,
        'Bearer starter-smoke-canary',
      );
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(chunk);
        assert.ok(
          chunks.reduce((count, item) => count + item.length, 0) <=
            2 * 1024 * 1024,
          'Bounded provider input required.',
        );
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      assert.equal(body.model, 'starter-smoke');
      assert.equal(body.stream, true);
      assert.equal(body.store, false);
      assert.ok(
        !body.previous_response_id,
        'Responses state must remain application-owned.',
      );
      const scenario = JSON.stringify(body.input).match(
        /starter-smoke-(?:cold-(?:known|unavailable)|approval|browser|decline|interrupt)/,
      )?.[0];
      assert.ok(scenario, 'Unrecognized strict provider request.');
      requests.push({ scenario, body });
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
      });
      let sequence = 0;
      const emit = (type, data) =>
        response.write(
          `event: ${type}\ndata: ${JSON.stringify({ ...data, type, sequence_number: sequence++ })}\n\n`,
        );
      const id = 'resp_' + requests.length;
      emit('response.created', {
        response: {
          id,
          object: 'response',
          created_at: 1720000000,
          model: body.model,
          status: 'in_progress',
          output: [],
        },
      });
      if (scenario === 'starter-smoke-interrupt') {
        response.once('close', () => {
          interruptions++;
        });
        return;
      }
      const continued = body.input.some(
        (item) => item.type === 'function_call_output',
      );
      const output = [];
      if (!continued) {
        const kinds = scenario.includes('cold-')
          ? ['native', 'browser']
          : scenario === 'starter-smoke-browser'
            ? ['browser']
            : ['native'];
        for (const kind of kinds) {
          const index = output.length,
            itemId = `fc_${requests.length}_${kind}`,
            callId = `${scenario}-${kind}`,
            name = kind === 'native' ? 'lookupAirport' : 'readBrowserNote';
          assert.ok(
            body.tools.some((tool) => tool.name === name),
            'Requested native/browser tool declaration missing.',
          );
          const args = JSON.stringify(
            kind === 'native' ? { code: 'SFO' } : { label: scenario },
          );
          emit('response.output_item.added', {
            output_index: index,
            item: {
              type: 'function_call',
              id: itemId,
              call_id: callId,
              name,
              arguments: '',
              status: 'in_progress',
            },
          });
          emit('response.function_call_arguments.delta', {
            item_id: itemId,
            output_index: index,
            delta: args,
          });
          emit('response.function_call_arguments.done', {
            item_id: itemId,
            output_index: index,
            arguments: args,
          });
          const item = {
            type: 'function_call',
            id: itemId,
            call_id: callId,
            name,
            arguments: args,
            status: 'completed',
          };
          output.push(item);
          emit('response.output_item.done', { output_index: index, item });
        }
      } else {
        const itemId = `msg_${requests.length}`,
          text = `done ${scenario}`,
          part = { type: 'output_text', text, annotations: [] };
        emit('response.output_item.added', {
          output_index: 0,
          item: {
            type: 'message',
            id: itemId,
            role: 'assistant',
            status: 'in_progress',
            content: [],
          },
        });
        emit('response.content_part.added', {
          item_id: itemId,
          output_index: 0,
          content_index: 0,
          part: { ...part, text: '' },
        });
        emit('response.output_text.delta', {
          item_id: itemId,
          output_index: 0,
          content_index: 0,
          delta: text,
          logprobs: [],
        });
        emit('response.output_text.done', {
          item_id: itemId,
          output_index: 0,
          content_index: 0,
          text,
          logprobs: [],
        });
        emit('response.content_part.done', {
          item_id: itemId,
          output_index: 0,
          content_index: 0,
          part,
        });
        const item = {
          type: 'message',
          id: itemId,
          role: 'assistant',
          status: 'completed',
          content: [part],
        };
        output.push(item);
        emit('response.output_item.done', { output_index: 0, item });
      }
      emit('response.completed', {
        response: {
          id,
          object: 'response',
          created_at: 1720000000,
          model: body.model,
          status: 'completed',
          output,
          usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
        },
      });
      response.end();
    } catch (error) {
      errors.push(error.name);
      if (!response.headersSent) response.writeHead(400);
      response.end('Strict Responses request rejected.');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    errors,
    interruptions: () => interruptions,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await smoke(options(process.argv.slice(2), ['metadata']));
