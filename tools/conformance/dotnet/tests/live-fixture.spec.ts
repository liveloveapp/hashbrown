import { createDotnetProbeDirectory } from '../harness/dotnet-probe-directory';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

test('live native fixture enforces dispatch, options, gate, cancellation, and wire bounds without cloud access', async () => {
  const directory = await createDotnetProbeDirectory('hashbrown-live-probe-');
  let redirectRequests = 0;
  let redirectedRequests = 0;
  const redirectServer = createServer((request, response) => {
    request.resume();
    if (request.url === '/redirected') redirectedRequests++;
    else redirectRequests++;
    response.writeHead(request.url === '/redirected' ? 200 : 302, {
      Location: '/redirected',
    });
    response.end();
  });
  await new Promise<void>((done) =>
    redirectServer.listen(0, '127.0.0.1', done),
  );
  const redirectOrigin = `http://127.0.0.1:${(redirectServer.address() as AddressInfo).port}`;
  const project = resolve(
    'tools/conformance/dotnet/Hashbrown.Conformance.csproj',
  );
  const source = await readFile(
    resolve('tools/conformance/dotnet/tests/fixtures/live-fixture.cs.txt'),
    'utf8',
  );

  try {
    await writeFile(
      join(directory, 'Probe.csproj'),
      `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings></PropertyGroup><ItemGroup><ProjectReference Include="${project}" /></ItemGroup></Project>`,
    );
    await writeFile(join(directory, 'Program.cs'), source);
    const result = await execute(
      process.env['DOTNET_HOST_PATH'] ?? 'dotnet',
      [
        'run',
        '--project',
        join(directory, 'Probe.csproj'),
        '--verbosity',
        'quiet',
      ],
      {
        timeout: 50_000,
        env: { ...process.env, LIVE_REDIRECT_LOOPBACK: redirectOrigin },
      },
    ).catch((error: { stdout?: string }) => {
      const compiler = (error.stdout ?? '')
        .split(/\r?\n/)
        .filter((line) => /error CS\d+:/.test(line));
      if (compiler.length) throw new Error(compiler.join('\n'));
      throw error;
    });

    expect(redirectRequests).toBe(1);
    expect(redirectedRequests).toBe(0);
    expect(result.stdout).toContain('Live native fixture passed.');
    expect(result.stdout + result.stderr).not.toContain('secret-canary');
  } finally {
    redirectServer.closeAllConnections();
    await new Promise<void>((done) => redirectServer.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);

test('native live launcher starts without dispatch and drains its process group on cancellation', async () => {
  const { startNativeLiveFixture } = await import('../harness/live-fixture');
  const { publicChildEnvironment } =
    await import('../harness/live-configuration');
  const controller = new AbortController();
  const fixture = await startNativeLiveFixture(
    {
      ...publicChildEnvironment(process.env),
      Provider: 'openai',
      ModelApi: 'responses',
      Model: 'gpt-4.1-mini',
      ModelEndpoint: 'https://native-unit.invalid/v1',
      AzureAuthentication: 'api-key',
      ApiKey: 'unit-only-key',
    },
    'structured-schema',
    controller.signal,
    ['http://127.0.0.1:4431'],
  );

  try {
    const response = await fetch(`${fixture.url}/__test/live-stats`);
    const stats = await response.json();

    expect(stats).toMatchObject({
      calls: 0,
      httpCalls: 0,
      cancelledCalls: 0,
      wire: [],
    });
    expect(JSON.stringify(stats)).not.toContain('unit-only-key');
    controller.abort();
    await fixture.stop();
    await expect(fetch(`${fixture.url}/health`)).rejects.toThrow();
  } finally {
    await fixture.stop();
  }
}, 20_000);

test('live child cleanup kills an independent-stdio descendant after its parent exits on SIGTERM', async () => {
  const { startNativeLiveFixture } = await import('../harness/live-fixture');
  const directory = await mkdtemp(join(tmpdir(), 'hashbrown-live-descendant-'));
  const parent = join(directory, 'parent');
  const descendant = join(directory, 'descendant.cjs');
  const pidFile = join(directory, 'descendant.pid');
  let descendantPid: number | undefined;
  let fixture: Awaited<ReturnType<typeof startNativeLiveFixture>> | undefined;
  await writeFile(
    descendant,
    `const fs = require('node:fs'); process.on('SIGTERM', () => {}); fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); process.send('ready'); process.disconnect(); setInterval(() => {}, 1000);`,
  );
  await writeFile(
    parent,
    `#!${process.execPath}\nconst { spawn } = require('node:child_process'); const child = spawn(process.execPath, [${JSON.stringify(descendant)}], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] }); child.once('message', () => console.log('Now listening on: http://127.0.0.1:19001')); setInterval(() => {}, 1000);`,
  );
  await chmod(parent, 0o755);

  try {
    fixture = await startNativeLiveFixture(
      { DOTNET_HOST_PATH: parent },
      'structured-schema',
      new AbortController().signal,
      [],
    );
    descendantPid = Number(await readFile(pidFile, 'utf8'));
    await fixture.stop();
    let alive = true;
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        process.kill(descendantPid, 0);
      } catch {
        alive = false;
        break;
      }
      await new Promise<void>((done) => setTimeout(done, 20));
    }

    expect(alive).toBe(false);
  } finally {
    await fixture?.stop();
    if (descendantPid) {
      try {
        process.kill(descendantPid, 'SIGKILL');
      } catch {
        /* Already stopped. */
      }
    }
    await rm(directory, { recursive: true, force: true });
  }
}, 10_000);

test('native live cleanup drains its worker before a separate credential-free schema owner starts', async () => {
  const { startNativeLiveFixture } = await import('../harness/live-fixture');
  const directory = await mkdtemp(join(tmpdir(), 'hashbrown-live-cleanup-'));
  const executable = join(directory, 'worker');
  const observation = join(directory, 'observation.json');
  const owner = join(directory, 'owner.pid');
  await writeFile(
    executable,
    `#!${process.execPath}
const fs=require('node:fs'), http=require('node:http');
if(process.env.FixtureDropSchemaOnly==='true') {
  let alive=true; try { process.kill(Number(fs.readFileSync(${JSON.stringify(owner)},'utf8')),0); } catch { alive=false; }
  fs.writeFileSync(${JSON.stringify(observation)},JSON.stringify({alive,key:process.env.ApiKey,profile:process.env.AZURE_CONFIG_DIR,pg:process.env.InterruptConnectionString,schema:process.env.InterruptSchema}));
} else fs.writeFileSync(${JSON.stringify(owner)},String(process.pid));
const server=http.createServer((req,res)=>{ req.resume(); res.end('ok'); });
server.listen(0,'127.0.0.1',()=>console.log('Now listening on: http://127.0.0.1:'+server.address().port));
`,
  );
  await chmod(executable, 0o755);
  const controller = new AbortController();
  const schema = 'durable_live_0123456789abcdef0123456789abcdef';
  const fixture = await startNativeLiveFixture(
    {
      DOTNET_HOST_PATH: executable,
      FixtureNativeSessions: 'true',
      InterruptConnectionString: 'postgres-secret-sentinel',
      InterruptSchema: schema,
      ApiKey: 'provider-secret-sentinel',
      AZURE_CONFIG_DIR: 'profile-secret-sentinel',
    },
    'mixed-native-tools',
    controller.signal,
    [],
  );

  try {
    controller.abort();
    await fixture.stop();

    expect(JSON.parse(await readFile(observation, 'utf8'))).toEqual({
      alive: false,
      pg: 'postgres-secret-sentinel',
      schema,
    });
    await fixture.stop();
  } finally {
    await fixture.stop();
    await rm(directory, { recursive: true, force: true });
  }
}, 10_000);

test('schema cleanup mode needs no provider configuration and rejects unowned schemas', async () => {
  const { startNativeLiveFixture } = await import('../harness/live-fixture');
  const { publicChildEnvironment } =
    await import('../harness/live-configuration');
  const environment = {
    ...publicChildEnvironment(process.env),
    FixtureDropSchemaOnly: 'true',
    InterruptConnectionString:
      'Host=127.0.0.1;Port=1;Username=unused;Password=postgres-secret-sentinel;Database=postgres',
    InterruptSchema: 'durable_live_0123456789abcdef0123456789abcdef',
  };
  const fixture = await startNativeLiveFixture(
    environment,
    'preflight',
    new AbortController().signal,
    [],
  );

  try {
    expect((await fetch(`${fixture.url}/health`)).ok).toBe(true);
    expect((await fetch(`${fixture.url}/__test/live-stats`)).status).toBe(404);
    expect((await fetch(`${fixture.url}/__test/counters`)).status).toBe(404);
  } finally {
    await fixture.stop();
  }
  await expect(
    startNativeLiveFixture(
      { ...environment, InterruptSchema: 'public' },
      'preflight',
      new AbortController().signal,
      [],
    ),
  ).rejects.toThrow('LIVE_CHILD_START_FAILED');
}, 20_000);

test('native live cleanup failure is retained after all owned children stop', async () => {
  const { startNativeLiveFixture } = await import('../harness/live-fixture');
  const directory = await mkdtemp(
    join(tmpdir(), 'hashbrown-live-cleanup-failed-'),
  );
  const executable = join(directory, 'worker');
  await writeFile(
    executable,
    `#!${process.execPath}
const http=require('node:http');
const server=http.createServer((req,res)=>{req.resume();res.writeHead(process.env.FixtureDropSchemaOnly==='true'?500:200);res.end();});
server.listen(0,'127.0.0.1',()=>console.log('Now listening on: http://127.0.0.1:'+server.address().port));
`,
  );
  await chmod(executable, 0o755);
  const fixture = await startNativeLiveFixture(
    {
      DOTNET_HOST_PATH: executable,
      FixtureNativeSessions: 'true',
      InterruptConnectionString: 'postgres-secret-sentinel',
      InterruptSchema: 'durable_live_0123456789abcdef0123456789abcdef',
    },
    'mixed-native-tools',
    new AbortController().signal,
    [],
  );

  try {
    await expect(fixture.stop()).rejects.toThrow('LIVE_CHILD_FAILED');
    await expect(fixture.stop()).rejects.toThrow('LIVE_CHILD_FAILED');
    await expect(fetch(`${fixture.url}/health`)).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 10_000);

test('native approval native live cleanup drains its worker before a separate credential-free schema owner starts', async () => {
  const { startNativeLiveFixture } = await import('../harness/live-fixture');
  const directory = await mkdtemp(join(tmpdir(), 'hashbrown-live-cleanup-'));
  const executable = join(directory, 'worker');
  const observation = join(directory, 'observation.json');
  const owner = join(directory, 'owner.pid');
  await writeFile(
    executable,
    `#!${process.execPath}
const fs=require('node:fs'), http=require('node:http');
if(process.env.FixtureDropSchemaOnly==='true') {
  let alive=true; try { process.kill(Number(fs.readFileSync(${JSON.stringify(owner)},'utf8')),0); } catch { alive=false; }
  fs.writeFileSync(${JSON.stringify(observation)},JSON.stringify({alive,key:process.env.ApiKey,profile:process.env.AZURE_CONFIG_DIR,pg:process.env.InterruptConnectionString,schema:process.env.InterruptSchema}));
} else fs.writeFileSync(${JSON.stringify(owner)},String(process.pid));
const server=http.createServer((req,res)=>{ req.resume(); res.end('ok'); });
server.listen(0,'127.0.0.1',()=>console.log('Now listening on: http://127.0.0.1:'+server.address().port));
`,
  );
  await chmod(executable, 0o755);
  const controller = new AbortController();
  const schema = 'durable_live_0123456789abcdef0123456789abcdef';
  const fixture = await startNativeLiveFixture(
    {
      DOTNET_HOST_PATH: executable,
      FixtureNativeSessions: 'true',
      FixtureNativeApprovals: 'true',
      NativeGate: '',
      InterruptConnectionString: 'postgres-secret-sentinel',
      InterruptSchema: schema,
      ApiKey: 'provider-secret-sentinel',
      AZURE_CONFIG_DIR: 'profile-secret-sentinel',
    },
    'native-approval',
    controller.signal,
    [],
  );

  try {
    controller.abort();
    await fixture.stop();

    expect(JSON.parse(await readFile(observation, 'utf8'))).toEqual({
      alive: false,
      pg: 'postgres-secret-sentinel',
      schema,
    });
    await fixture.stop();
  } finally {
    await fixture.stop();
    await rm(directory, { recursive: true, force: true });
  }
}, 10_000);

test('native approval native live cleanup failure is retained after all owned children stop', async () => {
  const { startNativeLiveFixture } = await import('../harness/live-fixture');
  const directory = await mkdtemp(
    join(tmpdir(), 'hashbrown-live-cleanup-failed-'),
  );
  const executable = join(directory, 'worker');
  await writeFile(
    executable,
    `#!${process.execPath}
const http=require('node:http');
const server=http.createServer((req,res)=>{req.resume();res.writeHead(process.env.FixtureDropSchemaOnly==='true'?500:200);res.end();});
server.listen(0,'127.0.0.1',()=>console.log('Now listening on: http://127.0.0.1:'+server.address().port));
`,
  );
  await chmod(executable, 0o755);
  const fixture = await startNativeLiveFixture(
    {
      DOTNET_HOST_PATH: executable,
      FixtureNativeSessions: 'true',
      FixtureNativeApprovals: 'true',
      NativeGate: '',
      InterruptConnectionString: 'postgres-secret-sentinel',
      InterruptSchema: 'durable_live_0123456789abcdef0123456789abcdef',
    },
    'native-approval',
    new AbortController().signal,
    [],
  );

  try {
    await expect(fixture.stop()).rejects.toThrow('LIVE_CHILD_FAILED');
    await expect(fixture.stop()).rejects.toThrow('LIVE_CHILD_FAILED');
    await expect(fetch(`${fixture.url}/health`)).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 10_000);

test('native approval launcher rejects missing protected mode or owned context before creating a child', async () => {
  const { startNativeLiveFixture } = await import('../harness/live-fixture');
  const environment = {
    FixtureNativeSessions: 'true',
    FixtureNativeApprovals: 'true',
    NativeGate: '',
    InterruptConnectionString: 'DB_CANARY',
    InterruptSchema: 'durable_live_0123456789abcdef0123456789abcdef',
    DOTNET_HOST_PATH: '/unit/must-not-spawn',
  };

  for (const mutation of [
    { FixtureNativeApprovals: '' },
    { FixtureNativeSessions: '' },
    { NativeGate: 'before-pending-save' },
    { InterruptSchema: 'public' },
    { InterruptConnectionString: '' },
  ])
    await expect(
      startNativeLiveFixture(
        { ...environment, ...mutation },
        'native-approval',
        new AbortController().signal,
        [],
      ),
    ).rejects.toThrow('LIVE_CHILD_START_FAILED');
});
