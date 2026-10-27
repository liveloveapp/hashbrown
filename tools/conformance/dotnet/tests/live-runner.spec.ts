import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createLiveCoordinator,
  executeLiveRunner,
  parseLiveRunnerArguments,
  resolveLivePlaywrightCli,
} from '../harness/live-runner';
import { startLiveStaticServer } from '../harness/live-static-server';
import {
  LIVE_PROJECTS,
  publicChildEnvironment,
} from '../harness/live-configuration';

test('list is independent of opt-in, credentials and child construction', async () => {
  const load = jest.fn();
  const start = jest.fn();

  const result = await executeLiveRunner(
    ['--list'],
    {},
    { loadConfiguration: load, execute: start },
  );

  expect(result).toEqual({
    exitCode: 0,
    projects: LIVE_PROJECTS.map((entry) => entry.name),
    cases: 54,
  });
  expect(load).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
});

test('unknown arguments and execution overrides fail before any credential read', async () => {
  const load = jest.fn();

  for (const option of [
    '--workers=2',
    '--retries=1',
    '--repeat-each=2',
    '--shard=1/2',
    '--grep=plain',
    '--project=react-openai-key',
    '--trace=on',
  ])
    await expect(
      executeLiveRunner([option], {}, { loadConfiguration: load }),
    ).rejects.toThrow('LIVE_ARGUMENT_INVALID');

  expect(load).not.toHaveBeenCalled();
});

test('execution requires opt-in before accessing the credential path', async () => {
  const load = jest.fn();

  await expect(
    executeLiveRunner(
      ['--credentials', '/not-read'],
      {},
      { loadConfiguration: load },
    ),
  ).rejects.toThrow('LIVE_OPT_IN_REQUIRED');

  expect(load).not.toHaveBeenCalled();
});

test('parses only credential and verified metadata paths without logging their contents', () => {
  const result = parseLiveRunnerArguments([
    '--credentials',
    '/private/input.env',
    '--consumer-metadata',
    '/tmp/consumer-metadata.json',
  ]);

  expect(result).toEqual({
    list: false,
    credentialFile: '/private/input.env',
    consumerMetadata: '/tmp/consumer-metadata.json',
  });
  expect(() => parseLiveRunnerArguments(['--credentials', ''])).toThrow(
    'LIVE_ARGUMENT_INVALID',
  );
});

test('static server serves isolated bundles and rejects path escape and symlinks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hashbrown-static-'));
  await writeFile(join(directory, 'index.html'), '<main>public</main>');
  const server = await startLiveStaticServer(directory);

  try {
    expect(await (await fetch(server.url)).text()).toBe('<main>public</main>');
    expect((await fetch(`${server.url}/%2e%2e%2fsecret`)).status).toBe(404);
    expect((await fetch(`${server.url}/missing.js`)).status).toBe(404);
  } finally {
    await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('coordinator rejects unauthenticated or unknown scenarios before starting native children', async () => {
  const start = jest.fn();
  const coordinator = await createLiveCoordinator({
    configuration: {
      projects: LIVE_PROJECTS,
      model: 'gpt-4.1-mini',
      providerEnvironment: () => ({ ApiKey: 'secret-canary' }),
    },
    origins: [],
    startFixture: start,
    diagnostic: () => undefined,
  });

  try {
    expect(
      (
        await fetch(`${coordinator.url}/fixture`, {
          method: 'POST',
          body: '{}',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${coordinator.url}/fixture`, {
          method: 'POST',
          headers: { 'X-Live-Capability': coordinator.capability },
          body: JSON.stringify({
            project: 'unknown',
            group: 'streaming-plain',
          }),
        })
      ).status,
    ).toBe(400);
    expect(start).not.toHaveBeenCalled();
  } finally {
    await coordinator.stop();
  }
});

test('actual Playwright forced failure discards assertion, DOM, cause and split child log canaries before persistence', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { readdir, readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'hashbrown-pw-canary-'));
  const canary = 'V9Qa72LmX4fP8nC6sR3tK5yB0wH1zD7u';
  const { liveSensitiveFragments, excludesLiveSensitiveFragments } =
    await import('./fixtures/live-sensitive-fragments');
  const fragments = liveSensitiveFragments(canary);
  const witness = join(directory, 'body-executed.txt');
  const guard = resolve(
    'tools/conformance/dotnet/harness/live-browser-fixture.ts',
  );
  const reporter = resolve('tools/conformance/dotnet/harness/live-reporter.ts');
  const nativeProof = resolve(
    'tools/conformance/dotnet/harness/live-native-approval.ts',
  );
  const diagnosticsPath = resolve(
    'tools/conformance/dotnet/harness/live-diagnostics.ts',
  );
  const { nativeApprovalUnitEvidence } =
    await import('./fixtures/live-native-approval');
  const { createLiveDiagnostics } = await import('../harness/live-diagnostics');
  const { createServer } = await import('node:http');
  const { appendFileSync } = await import('node:fs');
  const proof = nativeApprovalUnitEvidence().proof;
  const safeProof = join(directory, 'safe-proof.jsonl');
  const safeOutcomes = join(directory, 'safe-outcomes.jsonl');
  const sink = createLiveDiagnostics({
    write: (line) => appendFileSync(safeOutcomes, line),
  });
  const sinkServer = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const record = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    sink.record(record);
    response.writeHead(204).end();
  });
  await new Promise<void>((done) => sinkServer.listen(0, '127.0.0.1', done));
  const sinkOrigin = `http://127.0.0.1:${(sinkServer.address() as import('node:net').AddressInfo).port}`;
  const playwright = require.resolve('@playwright/test');
  const source = `import { test, expect } from ${JSON.stringify(playwright)};
import { withSafeLiveCase } from ${JSON.stringify(guard)};
import { parseLiveNativeApprovalProof } from ${JSON.stringify(nativeProof)};
import { spawnSync } from 'node:child_process';
import { writeFileSync, appendFileSync } from 'node:fs';
import { createLiveDiagnostics } from ${JSON.stringify(diagnosticsPath)};
test('native-approval', async ({page}, info) => {
 await withSafeLiveCase(async () => {
  const secret=process.env.CANARY_VALUE;
  const proof={...${JSON.stringify(proof)},project:'react-openai-key',group:'native-approval',rawRequestId:secret,rawCallId:secret,batch:secret,nativeBytes:secret,connectionString:secret};
  createLiveDiagnostics({write:line=>appendFileSync(${JSON.stringify(safeProof)},line)}).record(proof);
  try { parseLiveNativeApprovalProof(proof); } catch(error) { console.error(secret.slice(0,Math.floor(secret.length/2)));console.error(secret.slice(Math.floor(secret.length/2))); }
  console.error(secret.slice(0,Math.floor(secret.length/2)));console.error(secret.slice(Math.floor(secret.length/2)));
  console.log(JSON.stringify(proof));
  await page.setContent('<main>'+secret+'</main>');
  const child=spawnSync(process.execPath,['-e','process.stdout.write(process.env.CANARY_VALUE)'],{encoding:'utf8'});
  const output=child.stdout;console.log(output.slice(0,Math.floor(output.length/2)));console.log(output.slice(Math.floor(output.length/2)));
  writeFileSync(${JSON.stringify(witness)},'canary-body-reached-forced-assertion');
  try { expect(secret).toBe('public'); } catch (error) { throw new Error(secret,{cause:error}); }
 }, annotation=>info.annotations.push(annotation));
});`;
  await writeFile(join(directory, 'canary.spec.ts'), source);
  await writeFile(
    join(directory, 'playwright.config.ts'),
    `export default {testDir:${JSON.stringify(directory)},testMatch:'canary.spec.ts',workers:1,retries:0,projects:[{name:'react-openai-key'}],outputDir:${JSON.stringify(join(directory, 'outputs'))},reporter:[[${JSON.stringify(reporter)}]],use:{trace:'off',screenshot:'off',video:'off',launchOptions:{env:${JSON.stringify(publicChildEnvironment(process.env))}}}}`,
  );

  try {
    const result = await promisify(execFile)(
      process.execPath,
      [
        resolveLivePlaywrightCli(),
        'test',
        '--config',
        join(directory, 'playwright.config.ts'),
      ],
      {
        cwd: resolve('.'),
        env: {
          ...publicChildEnvironment(process.env),
          CANARY_VALUE: canary,
          HASHBROWN_LIVE_COORDINATOR: sinkOrigin,
          HASHBROWN_LIVE_CAPABILITY: 'c'.repeat(64),
          PLAYWRIGHT_NO_COPY_PROMPT: '1',
        },
        timeout: 30_000,
      },
    ).then(
      (value) => ({ ...value, code: 0 }),
      (error) => ({
        stdout: String(error.stdout),
        stderr: String(error.stderr),
        code: error.code,
      }),
    );
    const outputs: string[] = [];
    const scan = async (path: string) => {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const file = join(path, entry.name);
        if (entry.isDirectory()) await scan(file);
        else {
          outputs.push(file);
          outputs.push(await readFile(file, 'utf8'));
        }
      }
    };
    await scan(directory);

    expect(await readFile(witness, 'utf8')).toBe(
      'canary-body-reached-forced-assertion',
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('failed');
    expect(
      excludesLiveSensitiveFragments(
        [result.stdout, result.stderr, ...outputs],
        fragments,
      ),
    ).toBe(true);
    expect(outputs.join('\n')).not.toContain('error-context.md');
    const { parseLiveNativeApprovalProof } =
      await import('../harness/live-native-approval');
    expect(
      parseLiveNativeApprovalProof(
        JSON.parse((await readFile(safeProof, 'utf8')).trim()),
      ),
    ).toEqual(proof);
    expect(
      JSON.parse((await readFile(safeOutcomes, 'utf8')).trim()),
    ).toMatchObject({
      project: 'react-openai-key',
      group: 'native-approval',
      outcome: 'failed',
      failureCode: 'LIVE_ASSERTION_FAILED',
    });
    expect(() => sink.assertHealthy()).not.toThrow();
  } finally {
    sinkServer.closeAllConnections();
    await new Promise<void>((done) => sinkServer.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  }
}, 40_000);

test('coordinator passes only selected native environment and rejects duplicate scenario replay', async () => {
  const stop = jest.fn(async () => undefined);
  const start = jest.fn(async () => ({ url: 'http://127.0.0.1:1', stop }));
  const selected = { Provider: 'azure', AzureAuthentication: 'azure-cli' };
  const coordinator = await createLiveCoordinator({
    configuration: {
      projects: LIVE_PROJECTS,
      model: 'gpt-4.1-mini',
      providerEnvironment: () => selected,
    },
    origins: ['http://127.0.0.1:99'],
    startFixture: start,
    diagnostic: () => undefined,
  });
  const request = () =>
    fetch(`${coordinator.url}/fixture`, {
      method: 'POST',
      headers: { 'X-Live-Capability': coordinator.capability },
      body: JSON.stringify({
        project: 'react-azure-cli',
        group: 'streaming-plain',
      }),
    });

  try {
    const first = (await (await request()).json()) as { id: string };
    expect(start.mock.calls[0]).toEqual([
      selected,
      'streaming-plain',
      expect.any(AbortSignal),
      ['http://127.0.0.1:99'],
    ]);
    expect((await request()).status).toBe(400);
    expect(
      (
        await fetch(`${coordinator.url}/fixture/${first.id}`, {
          method: 'DELETE',
          headers: { 'X-Live-Capability': coordinator.capability },
        })
      ).status,
    ).toBe(204);
    expect((await request()).status).toBe(400);
    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  } finally {
    await coordinator.stop();
  }
});

test('coordinator links the whole run abort to in-flight native acquisition and drains its fixture', async () => {
  const controller = new AbortController();
  let nativeSignal: AbortSignal | undefined;
  const stop = jest.fn(async () => undefined);
  const start = jest.fn(async (_environment, _group, signal: AbortSignal) => {
    nativeSignal = signal;
    return { url: 'http://127.0.0.1:1', stop };
  });
  const coordinator = await createLiveCoordinator({
    configuration: {
      projects: LIVE_PROJECTS,
      model: 'gpt-4.1-mini',
      providerEnvironment: () => ({}),
    },
    origins: [],
    startFixture: start,
    diagnostic: () => undefined,
    signal: controller.signal,
  });
  await fetch(`${coordinator.url}/fixture`, {
    method: 'POST',
    headers: { 'X-Live-Capability': coordinator.capability },
    body: JSON.stringify({
      project: 'react-openai-key',
      group: 'streaming-plain',
    }),
  });

  controller.abort();
  await coordinator.stop();

  expect(nativeSignal?.aborted).toBe(true);
  expect(stop).toHaveBeenCalledTimes(1);
});

test('repeated tampered consumer verification rejects without rewriting the trusted baseline', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { resolve } = await import('node:path');
  const script = `
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {verifyConsumer} from ${JSON.stringify('file://' + require('node:path').resolve('tools/conformance/dotnet/live-consumer/verify.mjs'))};
import {qualifyConsumer} from ${JSON.stringify('file://' + require('node:path').resolve('tools/conformance/dotnet/live-consumer/qualify.mjs'))};
const repository=${JSON.stringify(require('node:path').resolve('.'))};
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'consumer-tamper-')));
try {
 const source=path.join(repository,'tools/conformance/dotnet/live-consumer');
 for(const file of ['package.json','package-lock.json','verify.mjs'])await fs.copyFile(path.join(source,file),path.join(root,file));
 const manifest=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 const lock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json'),'utf8'));
 await fs.mkdir(path.join(root,'node_modules'),{recursive:true});
 await fs.writeFile(path.join(root,'node_modules/.package-lock.json'),JSON.stringify(lock));
 for(const [name,version]of Object.entries(manifest.dependencies)){const dir=path.join(root,'node_modules',name);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'package.json'),JSON.stringify({name,version}));await fs.writeFile(path.join(dir,'index.js'),'export {};');}
 for(const dir of ['react/src','angular/src','templates','dist/react','dist/angular/browser'])await fs.mkdir(path.join(root,dir),{recursive:true});
 const ids=['core','react','angular'].map(name=>path.join(root,'node_modules/@hashbrownai',name,'index.js'));
 await fs.writeFile(path.join(root,'react-module-ids.json'),JSON.stringify(ids));
 await fs.writeFile(path.join(root,'dist/angular/browser-stats.json'),JSON.stringify({inputs:Object.fromEntries(ids.map(id=>[id,{}]))}));
 const bundle=path.join(root,'dist/react/index.html');await fs.writeFile(bundle,'trusted');
 const baseline=await verifyConsumer(root,repository);const original=await fs.readFile(baseline.metadataPath,'utf8');
 await fs.writeFile(bundle,'tampered');let failures=0;
 for(let attempt=0;attempt<2;attempt++){try{await qualifyConsumer(baseline.metadataPath);}catch{failures++;}}
 console.log(JSON.stringify({failures,unchanged:original===await fs.readFile(baseline.metadataPath,'utf8')}));
}finally{await fs.rm(root,{recursive:true,force:true});}`;

  const result = await promisify(execFile)(
    process.execPath,
    ['--input-type=module', '-e', script],
    { cwd: resolve('.'), timeout: 15_000 },
  );

  expect(JSON.parse(result.stdout)).toEqual({ failures: 2, unchanged: true });
});

test('coordinator flattens native wire and effect evidence into the single projected diagnostic sink', async () => {
  const { createServer } = await import('node:http');
  const { createLiveDiagnostics } = await import('../harness/live-diagnostics');
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify(
        request.url === '/__test/live-stats'
          ? {
              calls: 1,
              httpCalls: 1,
              wire: [
                {
                  method: 'POST',
                  path: '/openai/v1/responses',
                  authentication: 'bearer',
                  maxOutputTokens: 384,
                  status: 200,
                  secret: 'CANARY',
                },
              ],
            }
          : { server: 1, protected: 1, protectedCode: 'CANARY' },
      ),
    );
  });
  await new Promise<void>((accept) => server.listen(0, '127.0.0.1', accept));
  const address = server.address() as import('node:net').AddressInfo;
  const lines: string[] = [];
  const diagnostics = createLiveDiagnostics({
    write: (line) => lines.push(line),
  });
  const coordinator = await createLiveCoordinator({
    configuration: {
      projects: LIVE_PROJECTS,
      model: 'gpt-4.1-mini',
      providerEnvironment: () => ({}),
    },
    origins: [],
    startFixture: async () => ({
      url: `http://127.0.0.1:${address.port}`,
      stop: async () => undefined,
    }),
    diagnostic: diagnostics.record,
  });
  const headers = { 'X-Live-Capability': coordinator.capability };
  const fixture = (await (
    await fetch(`${coordinator.url}/fixture`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        project: 'react-azure-cli',
        group: 'server-tool',
      }),
    })
  ).json()) as { id: string };

  try {
    await fetch(`${coordinator.url}/fixture/${fixture.id}`, {
      method: 'DELETE',
      headers,
    });

    expect(lines.map((line) => JSON.parse(line))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          project: 'react-azure-cli',
          group: 'server-tool',
          provider: 'azure',
          auth: 'azure-cli',
          api: 'responses',
          calls: 1,
          httpCalls: 1,
        }),
        expect.objectContaining({
          method: 'POST',
          path: '/openai/v1/responses',
          authentication: 'bearer',
          maxOutputTokens: 384,
          status: 200,
        }),
        expect.objectContaining({ effects: 1, serverEffects: 1 }),
      ]),
    );
    expect(lines.join('')).not.toContain('CANARY');
  } finally {
    await coordinator.stop();
    server.closeAllConnections();
    await new Promise<void>((accept) => server.close(() => accept()));
  }
});

test('coordinator stop drains an in-progress startup and stops its child before returning', async () => {
  let enter!: () => void;
  const entered = new Promise<void>((accept) => {
    enter = accept;
  });
  let stopped = false;
  const coordinator = await createLiveCoordinator({
    configuration: {
      projects: LIVE_PROJECTS,
      model: 'gpt-4.1-mini',
      providerEnvironment: () => ({}),
    },
    origins: [],
    diagnostic: () => undefined,
    startFixture: async (_environment, _group, signal) => {
      enter();
      await new Promise<void>((accept) =>
        signal.addEventListener('abort', () => setTimeout(accept, 25), {
          once: true,
        }),
      );
      return {
        url: 'http://127.0.0.1:1',
        stop: async () => {
          stopped = true;
        },
      };
    },
  });
  const request = fetch(`${coordinator.url}/fixture`, {
    method: 'POST',
    headers: { 'X-Live-Capability': coordinator.capability },
    body: JSON.stringify({
      project: 'react-openai-key',
      group: 'streaming-plain',
    }),
  }).catch(() => undefined);
  await entered;

  await coordinator.stop();

  expect(stopped).toBe(true);
  await request;
});

test('qualification integrity requires actual unique passed cases, valid native facts and all preflights', async () => {
  const { createLiveQualificationLedger } =
    await import('../harness/live-qualification');
  const { LIVE_BUDGET_MANIFEST } = await import('../harness/live-budget');
  const stats = {
    calls: 2,
    httpCalls: 2,
    cancelledCalls: 1,
    stage: 'completed',
    inputTokens: 2,
    outputTokens: 2,
    wire: Array.from({ length: 2 }, () => ({
      method: 'POST',
      path: '/openai/v1/responses',
      authentication: 'bearer',
      maxOutputTokens: 384,
      store: false,
      status: 200,
    })),
  };
  const { nativeApprovalUnitEvidence } =
    await import('./fixtures/live-native-approval');
  const ledger = createLiveQualificationLedger();

  expect(() => ledger.assertComplete()).toThrow(
    'LIVE_QUALIFICATION_INCOMPLETE',
  );
  for (const project of LIVE_PROJECTS)
    for (const group of LIVE_BUDGET_MANIFEST.groups) {
      const calls = [
        'browser-tool',
        'server-tool',
        'cancellation-recovery',
        'mixed-native-tools',
      ].includes(group.name)
        ? 2
        : 1;
      const unitNative = nativeApprovalUnitEvidence();
      const evidence = {
        ...stats,
        nativeCoEmission: group.name === 'mixed-native-tools',
        nativeExactHistory: group.name === 'mixed-native-tools',
        calls,
        httpCalls: calls,
        cancelledCalls: group.name === 'cancellation-recovery' ? 1 : 0,
        wire: stats.wire.slice(0, calls).map((fact) => ({
          ...fact,
          path:
            project.provider === 'openai'
              ? '/v1/responses'
              : '/openai/v1/responses',
        })),
      };
      expect(
        ledger.recordFixture(
          project.name,
          group.name,
          group.name === 'native-approval'
            ? {
                ...unitNative.stats,
                wire: unitNative.stats.wire.map((fact) => ({
                  ...fact,
                  path:
                    project.provider === 'openai'
                      ? '/v1/responses'
                      : '/openai/v1/responses',
                })),
              }
            : evidence,
          group.name === 'native-approval'
            ? unitNative.counters
            : {
                server: ['server-tool', 'mixed-native-tools'].includes(
                  group.name,
                )
                  ? 1
                  : 0,
                durableNative: group.name === 'mixed-native-tools' ? 1 : 0,
                nativeCode: group.name === 'mixed-native-tools' ? 'PDX' : null,
                protected: group.name === 'approval-resume-decline' ? 1 : 0,
              },
        ),
      ).toBe(true);
      expect(
        ledger.recordOutcome({
          project: project.name,
          group: group.name,
          outcome: 'passed',
        }),
      ).toBe(true);
    }
  expect(() => ledger.assertComplete()).toThrow(
    'LIVE_QUALIFICATION_INCOMPLETE',
  );
  for (const name of LIVE_BUDGET_MANIFEST.preflights)
    expect(
      ledger.recordPreflight(
        name,
        {
          ...stats,
          calls: 1,
          httpCalls: 1,
          wire: stats.wire.slice(0, 1).map((fact) => ({
            ...fact,
            path:
              name === 'openai-responses'
                ? '/v1/responses'
                : name === 'azure-responses'
                  ? '/openai/v1/responses'
                  : '/openai/deployments/gpt-4.1-mini/chat/completions',
          })),
          cancelledCalls: 0,
        },
        { server: 0, protected: 0 },
      ),
    ).toBe(true);

  expect(() => ledger.assertComplete()).not.toThrow();
  expect(ledger.snapshot()).toMatchObject({
    actualPassedCases: 54,
    successfulPreflights: 3,
    completedFixtures: 54,
    invalid: false,
  });
});

test('qualification integrity rejects duplicate, skipped, failed, unknown and missing native evidence', async () => {
  const { createLiveQualificationLedger } =
    await import('../harness/live-qualification');
  for (const outcome of ['skipped', 'failed', 'timedOut', 'unknown']) {
    const ledger = createLiveQualificationLedger();
    expect(
      ledger.recordOutcome({
        project: 'react-openai-key',
        group: 'streaming-plain',
        outcome,
      }),
    ).toBe(false);
    expect(() => ledger.assertComplete()).toThrow(
      'LIVE_QUALIFICATION_INCOMPLETE',
    );
  }
  const duplicate = createLiveQualificationLedger();
  expect(
    duplicate.recordOutcome({
      project: 'react-openai-key',
      group: 'streaming-plain',
      outcome: 'passed',
    }),
  ).toBe(true);
  expect(
    duplicate.recordOutcome({
      project: 'react-openai-key',
      group: 'streaming-plain',
      outcome: 'passed',
    }),
  ).toBe(false);
  expect(duplicate.snapshot().invalid).toBe(true);
  const missing = createLiveQualificationLedger();
  expect(
    missing.recordFixture(
      'react-openai-key',
      'streaming-plain',
      { calls: 1, wire: [] },
      {},
    ),
  ).toBe(false);
  expect(
    missing.recordOutcome({
      project: 'unknown',
      group: 'streaming-plain',
      outcome: 'passed',
    }),
  ).toBe(false);
  expect(missing.snapshot().actualPassedCases).toBe(0);
});

test('coordinator does not equate a child exit zero with a completed qualification', async () => {
  const coordinator = await createLiveCoordinator({
    configuration: {
      projects: LIVE_PROJECTS,
      model: 'gpt-4.1-mini',
      providerEnvironment: () => ({}),
    },
    origins: [],
    startFixture: jest.fn(),
    diagnostic: () => undefined,
  });

  try {
    expect(() => coordinator.assertComplete()).toThrow(
      'LIVE_QUALIFICATION_INCOMPLETE',
    );
    expect(coordinator.snapshot()).toMatchObject({
      actualPassedCases: 0,
      successfulPreflights: 0,
    });
  } finally {
    await coordinator.stop();
  }
});

test('reporter fails qualification when a mandatory outcome POST cannot be persisted', async () => {
  const { default: LiveReporter } = await import('../harness/live-reporter');
  const reporter = new LiveReporter({
    postOutcome: async () => {
      throw new Error('CANARY');
    },
  });
  const fakeCase = {
    title: 'streaming-plain',
    parent: { project: () => ({ name: 'react-openai-key' }) },
  } as unknown as import('@playwright/test/reporter').TestCase;
  const fakeResult = {
    status: 'passed',
    duration: 1,
  } as import('@playwright/test/reporter').TestResult;

  reporter.onTestEnd(fakeCase, fakeResult);
  const result = await reporter.onEnd({
    status: 'passed',
  } as import('@playwright/test/reporter').FullResult);

  expect(result).toEqual({ status: 'failed' });
});

test('owned runner child cleanup kills surviving independent-stdio descendants after their parent exits', async () => {
  if (process.platform === 'win32') return;
  const { runOwnedChild } = await import('../harness/live-runner');
  const script = `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});child.unref();process.stdout.write(String(child.pid)+'\\n');`;
  const result = await runOwnedChild(
    process.execPath,
    ['-e', script],
    {},
    new AbortController().signal,
    true,
  );
  const pid = Number(result.lastLine);
  const alive = () => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  try {
    for (let attempt = 0; attempt < 40 && alive(); attempt++)
      await new Promise<void>((accept) => setTimeout(accept, 25));

    expect(result.code).toBe(0);
    expect(Number.isSafeInteger(pid) && pid > 0).toBe(true);
    expect(alive()).toBe(false);
  } finally {
    if (alive())
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* Already terminated. */
      }
  }
});

test('failed native preflight preserves safe wire facts without promoting qualification evidence', async () => {
  const { createServer } = await import('node:http');
  const { createLiveDiagnostics } = await import('../harness/live-diagnostics');
  const lines: string[] = [];
  const order: string[] = [];
  const diagnostics = createLiveDiagnostics({
    write: (line) => lines.push(line),
  });
  const server = createServer((request, response) => {
    request.resume();
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/__test/live-preflight') {
      response.writeHead(502);
      response.end(JSON.stringify({ error: 'CANARY-private-provider-error' }));
      return;
    }
    if (request.url === '/__test/live-stats') order.push('stats');
    response.end(
      JSON.stringify(
        request.url === '/__test/live-stats'
          ? {
              calls: 1,
              httpCalls: 1,
              cancelledCalls: 0,
              inputTokens: 0,
              outputTokens: 0,
              stage: 'failed',
              wire: [
                {
                  method: 'POST',
                  path: '/openai/deployments/gpt-4.1-mini/chat/completions',
                  status: 401,
                  authentication: 'bearer',
                  maxOutputTokens: 384,
                  store: false,
                  error: 'CANARY-private-provider-error',
                },
              ],
            }
          : { server: 0, protected: 0 },
      ),
    );
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const coordinator = await createLiveCoordinator({
    configuration: {
      projects: LIVE_PROJECTS,
      model: 'gpt-4.1-mini',
      providerEnvironment: () => ({}),
    },
    origins: [],
    diagnostic: diagnostics.record,
    startFixture: async () => ({
      url: origin,
      stop: async () => {
        order.push('stop');
      },
    }),
  });

  try {
    await expect(
      coordinator.preflight(
        'azure-cli-chat',
        'react-azure-cli',
        'chat-completions',
      ),
    ).rejects.toThrow('LIVE_PROVIDER_FAILED');

    expect(lines.map((line) => JSON.parse(line))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          calls: 1,
          httpCalls: 1,
          preflight: 'azure-cli-chat',
          stage: 'failed',
        }),
        expect.objectContaining({
          status: 401,
          authentication: 'bearer',
          path: '/openai/deployments/gpt-4.1-mini/chat/completions',
        }),
      ]),
    );
    expect(order).toEqual(['stats', 'stop']);
    expect(coordinator.snapshot().successfulPreflights).toBe(0);
    expect(lines.join('')).not.toContain('CANARY');
  } finally {
    await coordinator.stop();
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

test('runner resolves and launches the declared Playwright CLI bin in real Node with only public environment', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { resolve } = await import('node:path');
  const { publicChildEnvironment } =
    await import('../harness/live-configuration');
  const runner = resolve('tools/conformance/dotnet/harness/live-runner.ts');
  const script = `const {resolveLivePlaywrightCli}=require(${JSON.stringify(runner)});const {spawnSync}=require('node:child_process');const result=spawnSync(process.execPath,[resolveLivePlaywrightCli(),'--version'],{encoding:'utf8',env:process.env});process.stdout.write(JSON.stringify({code:result.status,stdout:result.stdout,stderr:result.stderr}));`;

  const result = await promisify(execFile)(
    process.execPath,
    ['--import', 'tsx', '-e', script],
    {
      cwd: resolve('.'),
      env: publicChildEnvironment(process.env),
      timeout: 15_000,
    },
  );

  expect(JSON.parse(result.stdout)).toEqual({
    code: 0,
    stdout: `Version ${require('playwright/package.json').version}\n`,
    stderr: '',
  });
});

test('native qualification rejects missing coemission, exact history, durable effect or actual two calls', async () => {
  const { createLiveQualificationLedger } =
    await import('../harness/live-qualification');
  const stats = {
    calls: 2,
    httpCalls: 2,
    cancelledCalls: 0,
    stage: 'completed',
    inputTokens: 2,
    outputTokens: 2,
    nativeCoEmission: true,
    nativeExactHistory: true,
    wire: Array.from({ length: 2 }, () => ({
      method: 'POST',
      path: '/v1/responses',
      authentication: 'bearer',
      maxOutputTokens: 384,
      store: false,
      status: 200,
    })),
  };
  const counters = {
    server: 1,
    protected: 0,
    durableNative: 1,
    nativeCode: 'PDX',
  };

  for (const change of [
    { nativeCoEmission: false },
    { nativeExactHistory: false },
    { calls: 1 },
    { calls: 3 },
  ])
    expect(
      createLiveQualificationLedger().recordFixture(
        'react-openai-key',
        'mixed-native-tools',
        { ...stats, ...change },
        counters,
      ),
    ).toBe(false);
  for (const change of [
    { durableNative: 0 },
    { durableNative: 2 },
    { nativeCode: 'SEA' },
    { server: 0 },
  ])
    expect(
      createLiveQualificationLedger().recordFixture(
        'react-openai-key',
        'mixed-native-tools',
        stats,
        { ...counters, ...change },
      ),
    ).toBe(false);
  expect(
    createLiveQualificationLedger().recordFixture(
      'react-openai-key',
      'mixed-native-tools',
      stats,
      counters,
    ),
  ).toBe(true);
});

test('native fixture context copies PostgreSQL only to its owned native child', async () => {
  const { nativeLiveChildEnvironment } =
    await import('../harness/live-configuration');
  const parent = {
    DOTNET_TEST_POSTGRES: 'Host=fixture;Password=postgres-secret-sentinel',
    ApiKey: 'parent-secret-sentinel',
  };
  const provider = { Provider: 'openai', ApiKey: 'selected-provider-key' };

  const native = nativeLiveChildEnvironment(
    provider,
    parent,
    'mixed-native-tools',
    'durable_live_0123456789abcdef0123456789abcdef',
  );
  const ordinary = nativeLiveChildEnvironment(
    provider,
    parent,
    'browser-tool',
    'durable_live_0123456789abcdef0123456789abcdef',
  );

  expect(native).toMatchObject({
    FixtureNativeSessions: 'true',
    InterruptSchema: 'durable_live_0123456789abcdef0123456789abcdef',
    InterruptConnectionString:
      parent.DOTNET_TEST_POSTGRES +
      ';Search Path=durable_live_0123456789abcdef0123456789abcdef',
    ApiKey: 'selected-provider-key',
  });
  expect(ordinary).toEqual(provider);
  expect(() =>
    nativeLiveChildEnvironment(
      provider,
      {},
      'mixed-native-tools',
      'durable_live_0123456789abcdef0123456789abcdef',
    ),
  ).toThrow('LIVE_POSTGRES_REQUIRED');
  expect(() =>
    nativeLiveChildEnvironment(
      provider,
      parent,
      'mixed-native-tools',
      'unowned',
    ),
  ).toThrow('LIVE_SCHEMA_INVALID');
});

test('coordinator preserves native proof through its sink and rejects non-OK shaped stats before promotion', async () => {
  const { createServer } = await import('node:http');
  const { createLiveDiagnostics } = await import('../harness/live-diagnostics');
  const { nativeApprovalUnitEvidence } =
    await import('./fixtures/live-native-approval');
  const unit = nativeApprovalUnitEvidence();
  let status = 200;
  const server = createServer((request, response) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify(
        request.url === '/__test/live-stats'
          ? { ...unit.stats, requestId: 'PRIVATE_CANARY' }
          : unit.counters,
      ),
    );
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const lines: string[] = [];
  const diagnostics = createLiveDiagnostics({
    write: (line) => lines.push(line),
  });
  const coordinator = await createLiveCoordinator({
    configuration: {
      projects: LIVE_PROJECTS,
      model: 'gpt-4.1-mini',
      providerEnvironment: () => ({}),
    },
    environment: { DOTNET_TEST_POSTGRES: 'unit-only-not-read' },
    origins: [],
    startFixture: async () => ({ url, stop: async () => undefined }),
    diagnostic: diagnostics.record,
  });
  const headers = { 'X-Live-Capability': coordinator.capability };
  try {
    for (const project of ['react-openai-key', 'angular-openai-key']) {
      const started = await fetch(`${coordinator.url}/fixture`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ project, group: 'native-approval' }),
      });
      expect(started.ok).toBe(true);
      const fixture = (await started.json()) as { id: string };
      await fetch(`${coordinator.url}/fixture/${fixture.id}`, {
        method: 'DELETE',
        headers,
      });
      status = 503;
    }

    expect(coordinator.snapshot()).toMatchObject({
      completedFixtures: 1,
      invalid: true,
    });
    const records = lines.map((line) => JSON.parse(line));
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          project: 'react-openai-key',
          nativeApprovalStage: 'followup',
          nativeApprovalJournalMatched: true,
          usageCompleteCalls: 3,
        }),
        expect.objectContaining({
          nativeProtectedEffects: 1,
          durableProtectedEffects: 0,
        }),
      ]),
    );
    expect(lines.join('')).not.toContain('PRIVATE_CANARY');
  } finally {
    await coordinator.stop();
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

test('expanded live execution requires final consumer metadata before reading provider configuration', async () => {
  const load = jest.fn();

  const result = executeLiveRunner(
    ['--credentials', '/must-not-read'],
    { HASHBROWN_LIVE_OPT_IN: '1' },
    { loadConfiguration: load },
  );

  await expect(result).rejects.toThrow('LIVE_CONSUMER_REQUIRED');
  expect(load).not.toHaveBeenCalled();
});

test('full artifact scanner rejects separately persisted newline-separated sensitive halves', async () => {
  const { liveSensitiveFragments, excludesLiveSensitiveFragments } =
    await import('./fixtures/live-sensitive-fragments');
  const fragments = liveSensitiveFragments(
    'UniqueLeftSecret2937UniqueRightSecret8471',
  );
  const leaked = `${fragments[1]}\n${fragments[2]}`;

  const accepted = excludesLiveSensitiveFragments(
    ['safe artifact', leaked],
    fragments,
  );

  expect(leaked).not.toContain(fragments[0]);
  expect(accepted).toBe(false);
  expect(
    excludesLiveSensitiveFragments([fragments[1], fragments[2]], fragments),
  ).toBe(false);
  expect(
    excludesLiveSensitiveFragments(
      ['safe stdout', 'safe stderr', 'safe artifact'],
      fragments,
    ),
  ).toBe(true);
});
