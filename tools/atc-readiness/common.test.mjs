import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  chmod,
  rm,
  realpath,
} from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as common from './common.mjs';

/** Make synthetic nonsecret identity evidence for pure manifest checks. */
function fixture() {
  return {
    sourceCommit: 'a'.repeat(40),
    version: '0.15.7',
    artifactSha256: 'b'.repeat(64),
    functionTreeSha256: 'c'.repeat(64),
    outputTreeSha256: 'd'.repeat(64),
    lockSha256: 'e'.repeat(64),
    databaseSha256: 'f'.repeat(64),
    packages: Object.fromEntries(
      ['cli', 'core', 'postgres-storage', 'sdk'].map((name) => [
        `@b4run/${name}`,
        { version: '0.15.7', integrity: 'sha512-Zml4dHVyZQ==' },
      ]),
    ),
    project: {
      id: 'prj_test',
      name: 'hashbrown-atc',
      ownerId: 'team_test',
      owner: 'test',
    },
    deployments: [
      {
        id: 'dpl_a',
        origin: 'https://a.example',
        target: 'preview',
        readyState: 'READY',
      },
      {
        id: 'dpl_b',
        origin: 'https://b.example',
        target: 'preview',
        readyState: 'READY',
      },
    ],
  };
}

test('pure manifest guard binds every identity before database access', () => {
  const expected = fixture();
  assert.equal(typeof common.validateManifest, 'function');
  assert.deepEqual(
    common.validateManifest(structuredClone(expected), expected),
    expected,
  );
  for (const key of [
    'sourceCommit',
    'version',
    'artifactSha256',
    'functionTreeSha256',
    'outputTreeSha256',
    'lockSha256',
    'databaseSha256',
  ]) {
    assert.throws(
      () =>
        common.validateManifest({ ...expected, [key]: 'mismatch' }, expected),
      /manifest/i,
    );
  }
  for (const change of [
    (m) => {
      m.project.id = 'other';
    },
    (m) => {
      m.packages['@b4run/core'].integrity = 'other';
    },
    (m) => {
      m.deployments[1].id = m.deployments[0].id;
    },
    (m) => {
      m.deployments[1].origin = m.deployments[0].origin;
    },
    (m) => {
      m.deployments[0].origin = 'http://a.example';
    },
    (m) => {
      m.deployments[0].target = 'production';
    },
    (m) => {
      m.deployments[0].readyState = 'BUILDING';
    },
    (m) => {
      m.deployments[0].origin += '/path';
    },
  ]) {
    const manifest = structuredClone(expected);
    change(manifest);
    assert.throws(
      () => common.validateManifest(manifest, expected),
      /manifest/i,
    );
  }
});

test('loader rejects actual source mismatch without opening database or reading secrets', async () => {
  let opens = 0;
  await assert.rejects(
    common.loadReadinessContext({
      expected: fixture(),
      manifest: fixture(),
      runtimeRoot: '/missing',
      stagingDirectory: '/missing',
      artifactPath: '/missing',
      secretFile: '/missing',
      openDatabase() {
        opens++;
      },
    }),
    /readiness|source/i,
  );
  assert.equal(opens, 0);
});

test('tree hash includes names, bytes and modes and rejects links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'atc-tree-'));
  try {
    await writeFile(join(root, 'a'), 'data');
    const first = await common.hashTree(root);
    await chmod(join(root, 'a'), 0o700);
    assert.notEqual(await common.hashTree(root), first);
    await symlink(join(root, 'a'), join(root, 'link'));
    await assert.rejects(common.hashTree(root), /symlink/);
    assert.equal(
      common.sha256('abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    assert.equal(common.stableStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('redactor removes whole secrets and decoded URI credentials from nested terminal errors', () => {
  const redact = common.createRedactor([
    'postgres://alice:p%40ss@example/db?sslmode=verify-full',
    'cookie-private',
  ]);
  const result = redact({
    error: new Error(
      'alice p@ss p%40ss cookie-private postgres://alice:p%40ss@example/db?sslmode=verify-full',
    ),
  });
  assert.doesNotMatch(
    JSON.stringify(result),
    /alice|p@ss|p%40ss|cookie-private/,
  );
  assert.match(JSON.stringify(result), /REDACTED/);
  assert.throws(
    () =>
      common.normalizeDatabaseUrl('postgres://x:y@example/db?sslmode=require'),
    /verify-full/,
  );
  assert.equal(
    new URL(
      common.normalizeDatabaseUrl(
        'postgres://x:y@example/db?sslmode=verify-full',
      ),
    ).searchParams.get('sslmode'),
    'verify-full',
  );
});

test('SSE parser incrementally decodes split UTF8, multiline data and terminal identity', () => {
  const parser = common.createSseParser({ runId: 'r', threadId: 't' });
  const bytes = new TextEncoder().encode(
    'data: {"type":"TEXT_MESSAGE_CONTENT",\r\ndata: "delta":"é"}\r\n\r\ndata: {"type":"RUN_FINISHED","runId":"r","threadId":"t"}\n\ndata: [DONE]\n\n',
  );
  const events = [];
  for (const byte of bytes) events.push(...parser.push(Uint8Array.of(byte)));
  assert.equal(events[0].delta, 'é');
  assert.equal(parser.finish().terminal.type, 'RUN_FINISHED');
  assert.equal(events.length, 2);
});

test('SSE rejects malformed, error, duplicate terminal, wrong identity and incomplete EOF', () => {
  for (const source of [
    'data: nope\n\n',
    'data: {"type":"RUN_ERROR","message":"secret"}\n\n',
    'data: {"type":"RUN_FINISHED","runId":"wrong","threadId":"t"}\n\n',
    'data: [DONE]\n\n',
    'data: {"type":"RUN_FINISHED","runId":"r","threadId":"t"}\n\ndata: {"type":"RUN_FINISHED","runId":"r","threadId":"t"}\n\n',
  ]) {
    const parser = common.createSseParser({ runId: 'r', threadId: 't' });
    assert.throws(() => {
      parser.push(source);
      parser.finish();
    }, /SSE/);
  }
  assert.throws(() => common.createSseParser().finish(), /SSE/);
});

test('stream timeout cancels reader; redirects and abort reject', async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
  );
  await assert.rejects(
    common.readSseStream(response, { timeoutMs: 10 }),
    /timeout/,
  );
  assert.equal(cancelled, true);
  await assert.rejects(common.readSseStream({ redirected: true }), /redirect/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    common.readSseStream(new Response(''), { signal: controller.signal }),
    /abort/i,
  );
});

test('canonical summary hashes full tuple, pending writes and thread record without revealing payload', async () => {
  let tuple = {
    checkpoint: { channel_values: { messages: ['private text'] } },
    pendingWrites: [['task', 'channel', 'cookie-secret']],
  };
  const saver = {
    async listNamespaces() {
      return [''];
    },
    async *list() {
      yield tuple;
    },
  };
  const pool = {
    async query(sql, params) {
      assert.deepEqual(params, ['thread']);
      return { rows: [{ count: '0' }] };
    },
  };
  const threadStore = {
    async getThread() {
      return { thread_id: 'thread', metadata: { private: 'secret' } };
    },
  };
  const first = await common.canonicalStorageSummary({
    pool,
    saver,
    threadStore,
    threadId: 'thread',
    tablePrefix: 'atc',
  });
  assert.equal(first.admissions, 0);
  assert.doesNotMatch(
    JSON.stringify(first),
    /private text|cookie-secret|metadata|"secret"/,
  );
  tuple = { ...tuple, pendingWrites: [['task', 'channel', 'changed']] };
  assert.notDeepEqual(
    await common.canonicalStorageSummary({
      pool,
      saver,
      threadStore,
      threadId: 'thread',
      tablePrefix: 'atc',
    }),
    first,
  );
});

/** Build a clean local source/artifact/secret fixture, with no network or real credentials. */
async function localContext() {
  const base = await mkdtemp(join(tmpdir(), 'atc-context-'));
  const runtimeRoot = join(base, 'runtime');
  const stage = join(base, 'stage');
  await mkdir(runtimeRoot);
  await mkdir(stage, { mode: 0o700 });
  const expected = fixture();
  const dependencies = {};
  const packages = {};
  for (const [name, evidence] of Object.entries(expected.packages)) {
    dependencies[name] = evidence.version;
    packages[`node_modules/${name}`] = evidence;
    await mkdir(join(runtimeRoot, 'node_modules', name), { recursive: true });
    await writeFile(
      join(runtimeRoot, 'node_modules', name, 'package.json'),
      JSON.stringify({ name, version: evidence.version }),
    );
  }
  await writeFile(
    join(runtimeRoot, 'package.json'),
    JSON.stringify({ dependencies }),
  );
  const lock = JSON.stringify({ lockfileVersion: 3, packages });
  await writeFile(join(runtimeRoot, 'package-lock.json'), lock);
  await writeFile(join(runtimeRoot, '.gitignore'), 'node_modules/\n');
  execFileSync('git', ['init', '-q', runtimeRoot]);
  execFileSync('git', ['-C', runtimeRoot, 'add', '.']);
  execFileSync('git', [
    '-C',
    runtimeRoot,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '-qm',
    'fixture',
  ]);
  expected.sourceCommit = execFileSync(
    'git',
    ['-C', runtimeRoot, 'rev-parse', 'HEAD'],
    { encoding: 'utf8' },
  ).trim();
  const artifactPath = join(stage, 'artifact');
  await writeFile(artifactPath, 'artifact');
  const functionTreePath = join(stage, 'function');
  const outputTreePath = join(stage, 'output');
  await mkdir(functionTreePath);
  await mkdir(outputTreePath);
  await writeFile(join(functionTreePath, 'index'), 'function');
  await writeFile(join(outputTreePath, 'config'), 'config');
  expected.artifactSha256 = common.sha256('artifact');
  expected.lockSha256 = common.sha256(lock);
  expected.functionTreeSha256 = await common.hashTree(functionTreePath);
  expected.outputTreeSha256 = await common.hashTree(outputTreePath);
  const secrets = {
    databaseUrl:
      'postgres://fake:fake@example.test/dedicated?sslmode=verify-full',
    cookieSecret: 'x'.repeat(32),
  };
  expected.databaseSha256 = common.sha256(
    common.normalizeDatabaseUrl(secrets.databaseUrl),
  );
  const secretFile = join(stage, 'preview.json');
  await writeFile(secretFile, JSON.stringify(secrets), { mode: 0o600 });
  return {
    base,
    options: {
      runtimeRoot,
      stagingDirectory: stage,
      artifactPath,
      functionTreePath,
      outputTreePath,
      secretFile,
      expected,
      manifest: structuredClone(expected),
    },
  };
}

test('loader checks actual complete source/package/tree/privacy/database evidence before any DB callback', async () => {
  const context = await localContext();
  let opens = 0;
  const options = {
    ...context.options,
    openDatabase: async () => {
      opens++;
      return 'fake-pool';
    },
  };
  try {
    assert.equal(
      (await common.loadReadinessContext(options)).database,
      'fake-pool',
    );
    assert.equal(opens, 1);
    const mutations = [
      async () => {
        options.manifest = {
          ...options.manifest,
          sourceCommit: '0'.repeat(40),
        };
      },
      async () => {
        await writeFile(options.artifactPath, 'drift');
      },
      async () => {
        await writeFile(join(options.functionTreePath, 'extra'), 'drift');
      },
      async () => {
        await writeFile(join(options.outputTreePath, 'extra'), 'drift');
      },
      async () => {
        await writeFile(join(options.runtimeRoot, 'untracked'), 'drift');
      },
      async () => {
        await chmod(options.secretFile, 0o644);
      },
      async () => {
        await chmod(options.stagingDirectory, 0o755);
      },
      async () => {
        await writeFile(
          options.secretFile,
          JSON.stringify({
            databaseUrl:
              'postgres://fake:fake@other.test/dedicated?sslmode=verify-full',
            cookieSecret: 'x'.repeat(32),
          }),
        );
      },
      async () => {
        await writeFile(
          join(options.runtimeRoot, 'node_modules/@b4run/core/package.json'),
          JSON.stringify({ version: '0.15.6' }),
        );
      },
    ];
    for (const mutate of mutations) {
      const fresh = await localContext();
      Object.assign(options, fresh.options);
      const before = opens;
      try {
        await mutate();
        await assert.rejects(common.loadReadinessContext(options), /readiness/);
        assert.equal(opens, before);
      } finally {
        await rm(fresh.base, { recursive: true, force: true });
      }
    }
  } finally {
    await rm(context.base, { recursive: true, force: true });
  }
});

test('manifest requires all four published package pins and source-root dependency resolution', () => {
  const expected = fixture();
  delete expected.packages['@b4run/sdk'];
  assert.throws(() => common.validateManifest(expected, expected), /manifest/);
  assert.equal(typeof common.resolveRuntimeDependency, 'function');
});

test('stream cancellation during a pending read cancels the owned reader', async () => {
  let cancelled = false;
  const controller = new AbortController();
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
  );
  const pending = common.readSseStream(response, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /abort/i);
  assert.equal(cancelled, true);
});

test('stream terminal failures sanitize reader and callback diagnostics', async () => {
  const redact = common.createRedactor([
    'cookie-private',
    'postgres://alice:p%40ss@example.test/db',
  ]);
  const response = new Response(
    new ReadableStream({
      pull(controller) {
        controller.error(new Error('alice p@ss cookie-private'));
      },
    }),
  );
  await assert.rejects(
    common.readSseStream(response, { redact }),
    (error) => !/alice|p@ss|cookie-private/.test(error.message),
  );
});

test('SSE validates caller identity on run-start events as well as terminals', () => {
  const parser = common.createSseParser({ runId: 'r', threadId: 't' });
  assert.throws(
    () =>
      parser.push(
        'data: {"type":"RUN_STARTED","runId":"foreign","threadId":"t"}\n\n',
      ),
    /SSE.*identity/,
  );
});

test('HTTP failure cancels response body without masking the HTTP diagnostic', async () => {
  let cancellations = 0;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancellations++;
        return Promise.reject(new Error('cleanup failure'));
      },
    }),
    { status: 500 },
  );
  await assert.rejects(
    common.readSseStream(response),
    /HTTP response rejected/,
  );
  assert.equal(cancellations, 1);
});

test('timeout rejection remains bounded when underlying cancellation never settles', async () => {
  let cancellations = 0;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancellations++;
        return new Promise(() => undefined);
      },
    }),
  );
  const result = await Promise.race([
    common.readSseStream(response, { timeoutMs: 5 }).then(
      () => 'unexpected success',
      (error) => error.message,
    ),
    new Promise((resolve) => setTimeout(() => resolve('still pending'), 50)),
  ]);
  assert.match(result, /SSE timeout/);
  assert.equal(cancellations, 1);
});

test('dependency resolver rejects nonexistent roots, ancestor fallback and package overlays', async () => {
  const root = await mkdtemp(join(tmpdir(), 'atc-resolution-'));
  try {
    const packageDirectory = join(root, 'node_modules', 'fixture-dependency');
    await mkdir(packageDirectory, { recursive: true });
    await writeFile(
      join(packageDirectory, 'package.json'),
      '{"name":"fixture-dependency","main":"index.js"}',
    );
    await writeFile(join(packageDirectory, 'index.js'), 'module.exports = {};');
    await writeFile(join(root, 'package.json'), '{"name":"root"}');
    assert.equal(
      common.resolveRuntimeDependency(root, 'fixture-dependency'),
      await realpath(join(packageDirectory, 'index.js')),
    );
    assert.throws(
      () =>
        common.resolveRuntimeDependency(
          join(root, 'missing'),
          'fixture-dependency',
        ),
      /root|dependency/,
    );
    const child = join(root, 'child');
    await mkdir(child);
    await writeFile(join(child, 'package.json'), '{}');
    assert.throws(
      () => common.resolveRuntimeDependency(child, 'fixture-dependency'),
      /root|dependency/,
    );
    await mkdir(join(child, 'node_modules'));
    await symlink(
      packageDirectory,
      join(child, 'node_modules', 'fixture-dependency'),
    );
    assert.throws(
      () => common.resolveRuntimeDependency(child, 'fixture-dependency'),
      /root|dependency/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('canonical serialization preserves Map and Set content, type and deterministic ordering', () => {
  const digest = (value) => common.sha256(common.stableStringify(value));
  assert.notEqual(digest(new Map([['a', 1]])), digest(new Map([['a', 2]])));
  assert.notEqual(digest(new Set(['a'])), digest(new Set(['b'])));
  assert.notEqual(digest(new Map()), digest({}));
  assert.notEqual(digest(new Set()), digest({}));
  assert.notEqual(digest(new Set()), digest(new Map()));
  assert.equal(
    digest(
      new Map([
        ['a', 1],
        ['b', new Set([1, 2])],
      ]),
    ),
    digest(
      new Map([
        ['b', new Set([2, 1])],
        ['a', 1],
      ]),
    ),
  );
  assert.equal(
    digest(new Set([{ a: 1, b: 2 }, 'x'])),
    digest(new Set(['x', { b: 2, a: 1 }])),
  );
  assert.notEqual(digest(Buffer.from('a')), digest(Buffer.from('b')));
  assert.notEqual(
    digest(new Date('2026-01-01')),
    digest(new Date('2026-01-02')),
  );
});

test('runtime errors remain failures while a dedicated callback preserves sanitized diagnostics', async () => {
  const frames = [];
  const redact = common.createRedactor(['fixture-private-token']);
  const response = new Response(
    'data: ' +
      JSON.stringify({
        type: 'RUN_ERROR',
        runId: 'r',
        threadId: 't',
        code: 'rate_limit_exceeded',
        message: 'fixture-private-token throttled',
      }) +
      '\n\n',
  );

  await assert.rejects(
    common.readSseStream(response, {
      runId: 'r',
      threadId: 't',
      redact,
      onErrorEvent: (event) => frames.push(redact(event)),
    }),
    /RUN_ERROR/,
  );

  assert.equal(frames.length, 1);
  assert.equal(frames[0].code, 'rate_limit_exceeded');
  assert(!JSON.stringify(frames).includes('fixture-private-token'));
});
