/**
 * Import-safe readiness utilities: no credentials, environment or database are read at import.
 * Manifest v1 schema: exact sourceCommit, version, artifactSha256, functionTreeSha256,
 * outputTreeSha256, lockSha256, databaseSha256; packages maps names to {version,integrity};
 * project={id,name,ownerId,owner}; deployments=[{id,origin,target:'preview',readyState:'READY'}] (two).
 * Expected evidence must come from independently reviewed provenance, never the manifest itself.
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, lstat, realpath } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

/** SHA256 digest of explicit bytes or UTF8 text. */
export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** Stable JSON with sorted object keys, preserving all array elements and byte values. */
export function stableStringify(value) {
  return JSON.stringify(value, function (key, item) {
    if (typeof item === 'bigint') return { $bigint: item.toString() };
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((k) => [k, item[k]]),
      );
    }
    return item;
  });
}

/** Hash a complete tree, including directory/file paths, permission bits and file bytes; reject links. */
export async function hashTree(root) {
  const entries = [];
  async function walk(path) {
    const info = await lstat(path);
    const name = relative(root, path).split('\\').join('/');
    if (info.isSymbolicLink())
      throw new Error('readiness tree contains symlink');
    if (info.isDirectory()) {
      entries.push([name, 'directory', info.mode & 0o777]);
      for (const child of (await readdir(path)).sort())
        await walk(join(path, child));
    } else if (info.isFile())
      entries.push([
        name,
        'file',
        info.mode & 0o777,
        sha256(await readFile(path)),
      ]);
    else throw new Error('readiness tree contains unsupported entry');
  }
  await walk(root);
  return sha256(stableStringify(entries));
}

/** Validate all nonsecret identity bindings against independent expected evidence; no I/O. */
export function validateManifest(manifest, expected) {
  const fail = () => {
    throw new Error('readiness manifest identity mismatch');
  };
  if (!manifest || !expected) fail();
  for (const key of [
    'sourceCommit',
    'version',
    'artifactSha256',
    'functionTreeSha256',
    'outputTreeSha256',
    'lockSha256',
    'databaseSha256',
  ]) {
    if (
      typeof expected[key] !== 'string' ||
      !expected[key] ||
      manifest[key] !== expected[key]
    )
      fail();
    if (key.endsWith('Sha256') && !/^[a-f0-9]{64}$/.test(manifest[key])) fail();
  }
  if (!/^[a-f0-9]{40}$/.test(manifest.sourceCommit)) fail();
  for (const key of ['id', 'name', 'ownerId', 'owner']) {
    if (
      !expected.project?.[key] ||
      manifest.project?.[key] !== expected.project[key]
    )
      fail();
  }
  if (
    !expected.packages ||
    !Object.keys(expected.packages).length ||
    stableStringify(manifest.packages) !== stableStringify(expected.packages)
  )
    fail();
  for (const name of ['cli', 'core', 'postgres-storage', 'sdk'])
    if (!manifest.packages[`@b4run/${name}`]) fail();
  for (const pkg of Object.values(manifest.packages)) {
    if (
      pkg.version !== manifest.version ||
      !/^sha512-[A-Za-z0-9+/=]+$/.test(pkg.integrity)
    )
      fail();
  }
  if (
    !Array.isArray(manifest.deployments) ||
    manifest.deployments.length !== 2 ||
    !Array.isArray(expected.deployments) ||
    expected.deployments.length !== 2
  )
    fail();
  for (let i = 0; i < 2; i++) {
    const deployment = manifest.deployments[i];
    if (
      !deployment?.id ||
      deployment.target !== 'preview' ||
      deployment.readyState !== 'READY'
    )
      fail();
    let url;
    try {
      url = new URL(deployment.origin);
    } catch {
      fail();
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.origin !== deployment.origin
    )
      fail();
    for (const key of ['id', 'origin', 'target', 'readyState'])
      if (deployment[key] !== expected.deployments[i]?.[key]) fail();
  }
  if (
    manifest.deployments[0].id === manifest.deployments[1].id ||
    manifest.deployments[0].origin === manifest.deployments[1].origin
  )
    fail();
  return manifest;
}

/** Resolve only from an explicit runtime root; no ambient cwd dependency resolution. */
export function resolveRuntimeDependency(runtimeRoot, name) {
  return createRequire(join(resolve(runtimeRoot), 'package.json')).resolve(
    name,
  );
}

/** Normalize a dedicated Postgres DSN with verified TLS; never accept generic environment fallback. */
export function normalizeDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('readiness invalid database URL');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    !url.pathname ||
    url.pathname === '/' ||
    url.searchParams.get('sslmode') !== 'verify-full'
  ) {
    throw new Error('readiness database requires verify-full');
  }
  if (
    url.searchParams.has('ssl') ||
    (url.searchParams.has('sslmode') &&
      url.searchParams.getAll('sslmode').length !== 1)
  )
    throw new Error('readiness ambiguous database TLS');
  url.searchParams.sort();
  return url.href;
}

/** Build a recursive sanitizer covering whole values, URI encoded and decoded credentials, Errors and causes. */
export function createRedactor(secretValues = []) {
  const secrets = new Set();
  for (const value of secretValues) {
    if (typeof value !== 'string' || !value) continue;
    secrets.add(value);
    try {
      const url = new URL(value);
      for (const credential of [url.username, url.password])
        if (credential) {
          secrets.add(credential);
          secrets.add(decodeURIComponent(credential));
        }
    } catch {
      /* Non-URI whole secrets still redact. */
    }
  }
  const ordered = [...secrets].sort((a, b) => b.length - a.length);
  function redact(value, seen = new WeakSet()) {
    if (typeof value === 'string') {
      for (const secret of ordered)
        value = value.split(secret).join('[REDACTED]');
      return value.replace(
        /([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi,
        '$1[REDACTED]@',
      );
    }
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (value instanceof Error)
      return {
        name: redact(value.name),
        message: redact(value.message),
        ...(value.cause === undefined
          ? {}
          : { cause: redact(value.cause, seen) }),
      };
    if (Array.isArray(value)) return value.map((item) => redact(item, seen));
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        redact(key),
        redact(item, seen),
      ]),
    );
  }
  return redact;
}

/**
 * Validate actual clean runtime, lock/package evidence, artifact and complete trees BEFORE credentials/DB.
 * secretFile is a private JSON object {databaseUrl,cookieSecret,...}, distinct from pulled
 * preview.env (caller owns cleanup of BOTH). stagingDirectory mode0700,
 * secretFile mode0600. functionTreePath/outputTreePath are explicit complete trees.
 * Returns {manifest,database,redact,secrets}; caller owns the injected database lifecycle and secrets.
 */
export async function loadReadinessContext(options) {
  const {
    expected,
    runtimeRoot,
    stagingDirectory,
    secretFile,
    artifactPath,
    functionTreePath,
    outputTreePath,
    openDatabase,
  } = options;
  try {
    const manifest =
      options.manifest ??
      JSON.parse(await readFile(options.manifestPath, 'utf8'));
    validateManifest(manifest, expected);
    const gitOptions = {
      cwd: runtimeRoot,
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    };
    const head = (
      await exec('git', ['rev-parse', 'HEAD'], gitOptions)
    ).stdout.trim();
    const status = (
      await exec(
        'git',
        ['status', '--porcelain', '--untracked-files=all'],
        gitOptions,
      )
    ).stdout;
    if (head !== expected.sourceCommit || status.trim())
      throw new Error('source mismatch');
    const lockBytes = await readFile(join(runtimeRoot, 'package-lock.json'));
    if (
      sha256(lockBytes) !== expected.lockSha256 ||
      sha256(await readFile(artifactPath)) !== expected.artifactSha256 ||
      (await hashTree(functionTreePath)) !== expected.functionTreeSha256 ||
      (await hashTree(outputTreePath)) !== expected.outputTreeSha256
    )
      throw new Error('artifact mismatch');
    const lock = JSON.parse(lockBytes);
    const rootPackage = JSON.parse(
      await readFile(join(runtimeRoot, 'package.json'), 'utf8'),
    );
    for (const [name, evidence] of Object.entries(expected.packages)) {
      const installed = JSON.parse(
        await readFile(
          join(runtimeRoot, 'node_modules', name, 'package.json'),
          'utf8',
        ),
      );
      const pin =
        rootPackage.dependencies?.[name] ?? rootPackage.devDependencies?.[name];
      const locked = lock.packages?.[`node_modules/${name}`];
      if (
        pin !== expected.version ||
        installed.version !== evidence.version ||
        locked?.version !== evidence.version ||
        locked?.integrity !== evidence.integrity
      )
        throw new Error('package mismatch');
    }
    const stage = await lstat(stagingDirectory);
    const file = await lstat(secretFile);
    const stageReal = await realpath(stagingDirectory);
    const fileReal = await realpath(secretFile);
    const within = relative(stageReal, fileReal);
    if (
      !stage.isDirectory() ||
      stage.isSymbolicLink() ||
      (stage.mode & 0o777) !== 0o700 ||
      !file.isFile() ||
      file.isSymbolicLink() ||
      (file.mode & 0o777) !== 0o600 ||
      within.startsWith('..') ||
      resolve(stageReal, within) !== fileReal
    )
      throw new Error('privacy mismatch');
    const secrets = JSON.parse(await readFile(secretFile, 'utf8'));
    const redact = createRedactor(Object.values(secrets));
    try {
      const databaseUrl = normalizeDatabaseUrl(secrets.databaseUrl);
      if (
        sha256(databaseUrl) !== expected.databaseSha256 ||
        typeof secrets.cookieSecret !== 'string' ||
        Buffer.byteLength(secrets.cookieSecret) < 32
      )
        throw new Error('database identity mismatch');
      if (typeof openDatabase !== 'function')
        throw new Error('database callback required');
      return {
        manifest,
        secrets,
        redact,
        database: await openDatabase(databaseUrl),
      };
    } catch (error) {
      throw new Error(
        `readiness initialization failed: ${redact(error).message}`,
      );
    }
  } catch {
    throw new Error(
      'readiness initialization rejected; verify source, manifest, artifact, packages and private credentials',
    );
  }
}

/** Incremental UTF8 SSE parser; optional caller identity must match exactly on RUN_FINISHED. */
export function createSseParser({ runId, threadId } = {}) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  let terminal;
  let done = false;
  let closed = false;
  function parse(flush = false) {
    const events = [];
    for (;;) {
      const boundary = /\r\n\r\n|\n\n|\r\r/.exec(buffer);
      if (!boundary) break;
      const frame = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
      const data = frame
        .split(/\r\n|\n|\r/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (!data) continue;
      if (done) throw new Error('SSE data after DONE');
      if (data === '[DONE]') {
        if (!terminal) throw new Error('SSE DONE before terminal');
        done = true;
        continue;
      }
      if (terminal)
        throw new Error('SSE duplicate terminal or event after terminal');
      let event;
      try {
        event = JSON.parse(data);
      } catch {
        throw new Error('SSE malformed JSON');
      }
      if (!event || typeof event.type !== 'string')
        throw new Error('SSE invalid event');
      if (
        (runId !== undefined &&
          event.runId !== undefined &&
          event.runId !== runId) ||
        (threadId !== undefined &&
          event.threadId !== undefined &&
          event.threadId !== threadId)
      )
        throw new Error('SSE event identity mismatch');
      if (event.type === 'RUN_ERROR') throw new Error('SSE RUN_ERROR');
      if (event.type === 'RUN_FINISHED') {
        if (
          (runId !== undefined && event.runId !== runId) ||
          (threadId !== undefined && event.threadId !== threadId)
        )
          throw new Error('SSE terminal identity mismatch');
        terminal = event;
      }
      events.push(event);
    }
    if (flush && buffer.trim()) throw new Error('SSE incomplete frame at EOF');
    return events;
  }
  return {
    /** Supply arbitrary text or byte chunks and return fully parsed events. */
    push(chunk) {
      if (closed) throw new Error('SSE parser closed');
      buffer +=
        typeof chunk === 'string'
          ? chunk
          : decoder.decode(chunk, { stream: true });
      return parse();
    },
    /** Finish only after a complete terminal frame and clean EOF. */
    finish() {
      if (closed) throw new Error('SSE parser closed');
      closed = true;
      buffer += decoder.decode();
      parse(true);
      if (!terminal) throw new Error('SSE missing terminal');
      return { terminal, done };
    },
  };
}

/** Consume a no-redirect successful response with a total deadline/abort and cancel on every failure. */
export async function readSseStream(
  response,
  {
    timeoutMs = 55000,
    signal,
    onEvent = () => {},
    onChunk = () => {},
    runId,
    threadId,
    redact = createRedactor(),
  } = {},
) {
  if (response.redirected || (response.status >= 300 && response.status < 400))
    throw new Error('SSE redirect rejected');
  if (!response.ok || !response.body)
    throw new Error('SSE HTTP response rejected');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error('SSE timeout invalid');
  const reader = response.body.getReader();
  const parser = createSseParser({ runId, threadId });
  let timer;
  let abort;
  const stopped = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('SSE timeout')), timeoutMs);
    abort = () => reject(new Error('SSE aborted'));
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
  try {
    for (;;) {
      const { value, done } = await Promise.race([reader.read(), stopped]);
      if (done) return parser.finish();
      if (value.length) onChunk(value);
      for (const event of parser.push(value)) onEvent(event);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw new Error(redact(error)?.message ?? 'SSE stream failed');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

/**
 * First query reads the owned thread's admissions exactly once (never poll zero).
 * B4 0.15.7 saver.listNamespaces/list include complete tuples and pendingWrites;
 * threadStore.getThread includes the full thread record. Only digests/counts leave this helper.
 */
export async function canonicalStorageSummary({
  pool,
  saver,
  threadStore,
  threadId,
  schema = 'public',
  tablePrefix,
}) {
  if (
    ![schema, tablePrefix].every(
      (value) =>
        typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value),
    ) ||
    typeof threadId !== 'string' ||
    !threadId
  )
    throw new Error('readiness invalid storage identity');
  const admission = await pool.query(
    `SELECT count(*) AS count FROM "${schema}"."${tablePrefix}_run_admissions" WHERE thread_id = $1`,
    [threadId],
  );
  const admissions = Number(admission.rows[0]?.count);
  if (!Number.isSafeInteger(admissions) || admissions < 0)
    throw new Error('readiness invalid admission count');
  const tuples = [];
  for (const namespace of await saver.listNamespaces(threadId)) {
    for await (const tuple of saver.list({
      configurable: { thread_id: threadId, checkpoint_ns: namespace },
    }))
      tuples.push({ namespace, tuple });
  }
  const thread = await threadStore.getThread(threadId);
  const records = tuples.map((item) => ({
    namespaceSha256: sha256(item.namespace),
    sha256: sha256(stableStringify(item.tuple)),
    pendingWrites: item.tuple.pendingWrites?.length ?? 0,
  }));
  records.sort((a, b) =>
    stableStringify(a).localeCompare(stableStringify(b), 'en'),
  );
  return {
    threadId,
    admissions,
    checkpointCount: records.length,
    checkpoints: records,
    tuplesSha256: sha256(stableStringify(records)),
    threadSha256: sha256(stableStringify(thread ?? null)),
    threadPresent: thread !== undefined,
  };
}
