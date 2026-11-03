import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { digest, readPhysical, repository } from './files.mjs';

/**
 * Requires two distinct explicit absolute candidate pointers without environment defaults.
 *
 * Parsing does not qualify descriptors or acquire runtime resources.
 */
export function parseCandidateArguments(args) {
  if (!Array.isArray(args)) throw Error('Candidate pointer arguments required');
  const parsed = {};
  for (const argument of args) {
    if (typeof argument !== 'string')
      throw Error('Unknown candidate pointer argument');
    const match = argument.match(/^(--npm-metadata|--metadata)=(.*)$/);
    if (!match) throw Error(`Unknown candidate argument: ${argument}`);
    const key =
      match[1] === '--npm-metadata' ? 'npmMetadataPath' : 'nugetMetadataPath';
    if (Object.hasOwn(parsed, key))
      throw Error(`Duplicate candidate metadata argument: ${match[1]}`);
    if (
      !path.isAbsolute(match[2]) ||
      path.resolve(match[2]) !== match[2] ||
      match[2].includes('\0')
    )
      throw Error('Candidate metadata pointer must be an absolute path');
    parsed[key] = match[2];
  }
  if (!parsed.npmMetadataPath || !parsed.nugetMetadataPath)
    throw Error('Both explicit candidate metadata pointers are required');
  if (parsed.npmMetadataPath === parsed.nugetMetadataPath)
    throw Error('Candidate metadata pointers must be distinct');
  return parsed;
}

/** Separates an explicit positional execution scope from the unchanged two-pointer parser. */
export function parseCandidateBrowserInvocation(args) {
  if (!Array.isArray(args) || !['pilot', 'all'].includes(args[0]))
    throw Error('Explicit candidate browser mode pilot or all required');
  return { mode: args[0], ...parseCandidateArguments(args.slice(1)) };
}

/** Copies only execution context and trusted qualified bindings; credentials and runtime injection never inherit. */
export function candidateBrowserChildEnvironment(source, trusted) {
  const result = {};
  for (const key of [
    'PATH',
    'TMPDIR',
    'TMP',
    'TEMP',
    'SystemRoot',
    'WINDIR',
    'LANG',
    'LC_ALL',
    'DOTNET_ROOT',
    'DOTNET_HOST_PATH',
    'DOTNET_TEST_POSTGRES',
  ])
    if (typeof source[key] === 'string') result[key] = source[key];
  return {
    ...result,
    HASHBROWN_DOTNET_HOST_MODE: 'package',
    HASHBROWN_DOTNET_CONSUMER_METADATA: trusted.packagePointer,
    HASHBROWN_DOTNET_CONSUMER_SHA256: trusted.packagePointerSha256,
    HASHBROWN_CANDIDATE_NPM_METADATA: trusted.npmMetadataPath,
    HASHBROWN_CANDIDATE_NUGET_METADATA: trusted.nugetMetadataPath,
    HASHBROWN_CANDIDATE_BROWSER_MODE: trusted.mode,
    HASHBROWN_PACKAGE_REACT_URL: trusted.origins.react,
    HASHBROWN_PACKAGE_ANGULAR_URL: trusted.origins.angular,
    HASHBROWN_CANDIDATE_EVIDENCE: trusted.evidenceDirectory,
    HASHBROWN_CANDIDATE_OUTCOMES: path.join(
      trusted.evidenceDirectory,
      'outcomes.json',
    ),
    HASHBROWN_PACKAGE_SPAWN_REPORT: path.join(
      trusted.evidenceDirectory,
      'spawns.jsonl',
    ),
    FixtureOrigins: `${trusted.origins.react},${trusted.origins.angular}`,
  };
}

/** Waits a finite interval for the exact newly spawned process group to disappear. */
async function waitForOwnedGroupExit(pid, milliseconds) {
  const end = performance.now() + milliseconds;
  while (true) {
    try {
      process.kill(-pid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') return true;
      throw error;
    }
    if (performance.now() >= end) return false;
    await new Promise((accept) => setTimeout(accept, 10));
  }
}

/** Drains only the exact detached group created by this launcher, retaining independent cleanup failures. */
async function drainOwnedGroup(pid, graceMs, drainMs) {
  if (pid === undefined) return [];
  const errors = [];
  const signal = (value) => {
    try {
      process.kill(-pid, value);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  try {
    if (await waitForOwnedGroupExit(pid, 0)) return errors;
  } catch (error) {
    errors.push(error);
  }
  try {
    signal('SIGTERM');
  } catch (error) {
    errors.push(error);
  }
  try {
    if (await waitForOwnedGroupExit(pid, graceMs)) return errors;
  } catch (error) {
    errors.push(error);
  }
  try {
    signal('SIGKILL');
  } catch (error) {
    errors.push(error);
  }
  try {
    if (!(await waitForOwnedGroupExit(pid, drainMs)))
      errors.push(
        Error('Owned candidate process group survived bounded SIGKILL drain'),
      );
  } catch (error) {
    errors.push(error);
  }
  return errors;
}

/** Launches and fully drains one newly owned detached group before any caller can perform postqualification. */
export async function launchCandidateOwnedProcess(options) {
  const runtimeMs = options.runtimeTimeoutMs ?? 300_000;
  const graceMs = options.terminationGraceMs ?? 10_000;
  const drainMs = options.drainTimeoutMs ?? 10_000;
  assert.ok(
    Number.isSafeInteger(runtimeMs) &&
      runtimeMs > 0 &&
      runtimeMs <= 4 * 60 * 60 * 1000,
    'Finite internal owned-process runtime required',
  );
  for (const value of [graceMs, drainMs])
    assert.ok(
      Number.isSafeInteger(value) && value > 0 && value <= 300_000,
      'Finite internal owned-process deadline required',
    );
  const log = await fs.open(options.logPath, 'wx');
  const errors = [];
  let child;
  let status = -1;
  let writes = Promise.resolve();
  let timer;
  let logFailure = false;
  let interrupt;
  const interrupted = new Promise((accept) => {
    interrupt = accept;
  });
  let receivedSignal;
  const handleSignal = (signal) => {
    if (receivedSignal === undefined) {
      receivedSignal = signal;
      errors.push(Error(`Candidate process interrupted by ${signal}`));
    }
    interrupt();
  };
  const signalListeners = {
    SIGINT: () => handleSignal('SIGINT'),
    SIGTERM: () => handleSignal('SIGTERM'),
  };
  for (const [signal, listener] of Object.entries(signalListeners))
    process.on(signal, listener);
  let closed;
  try {
    child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.environment,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    closed = new Promise((accept) => {
      child.once('close', (code) => {
        clearTimeout(timer);
        status = code ?? -1;
        accept();
      });
      child.once('error', (error) => {
        errors.push(error);
        interrupt();
      });
    });
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (bytes) => {
        process.stderr.write(bytes);
        writes = writes
          .then(() => log.write(bytes))
          .then(() => undefined)
          .catch((error) => {
            if (!logFailure) {
              logFailure = true;
              errors.push(error);
            }
            interrupt();
          });
      });
    timer = setTimeout(() => {
      errors.push(Error('Candidate process runtime deadline exceeded'));
      interrupt();
    }, runtimeMs);
    if (child.pid) options.onSpawn?.(child.pid);
    await Promise.race([closed, interrupted]);
  } catch (error) {
    errors.push(error);
  } finally {
    try {
      clearTimeout(timer);
      // Leader close is not group completion. Retain the TERM/KILL/drain owner through every terminal path.
      errors.push(...(await drainOwnedGroup(child?.pid, graceMs, drainMs)));
      if (closed) {
        let closeDeadline;
        try {
          await Promise.race([
            closed,
            new Promise((_, reject) => {
              closeDeadline = setTimeout(
                () =>
                  reject(
                    Error(
                      'Owned candidate leader pipes did not close after group drain',
                    ),
                  ),
                drainMs,
              );
            }),
          ]);
        } catch (error) {
          errors.push(error);
        } finally {
          clearTimeout(closeDeadline);
        }
      }
      try {
        await writes;
      } catch (error) {
        errors.push(error);
      }
      try {
        await log.close();
      } catch (error) {
        errors.push(error);
      }
    } finally {
      for (const [signal, listener] of Object.entries(signalListeners))
        process.removeListener(signal, listener);
    }
  }
  if (errors.length) {
    if (status !== 0 && status !== -1)
      errors.unshift(Error(`Original candidate process exit status ${status}`));
    if (errors.length === 1) throw errors[0];
    throw new AggregateError(
      errors,
      `Candidate process or owned-group cleanup failed: ${errors.map((error) => error.message ?? String(error)).join('; ')}`,
    );
  }
  return status;
}

/** Delegates the unchanged exact Playwright command to the owned process lifecycle helper. */
async function launchPlaywright(environment, evidence, runtimeTimeoutMs) {
  return launchCandidateOwnedProcess({
    command: process.execPath,
    args: [
      path.join(repository, 'node_modules/playwright/cli.js'),
      'test',
      '--config',
      path.join(
        repository,
        'tools/conformance/dotnet/candidate-recovery.playwright.config.ts',
      ),
      '--output',
      path.join(evidence, 'playwright'),
    ],
    cwd: repository,
    environment,
    logPath: path.join(evidence, 'playwright.log'),
    runtimeTimeoutMs,
  });
}

/** Attempts every independent postqualification and anchor check while retaining all prior execution/cleanup errors. */
export async function candidateBrowserPostflight(checks, priorErrors = []) {
  const errors = [...priorErrors];
  const operations = [
    { label: 'npm qualification', check: checks.npm },
    { label: 'NuGet qualification', check: checks.nuget },
    ...checks.anchors,
  ];
  for (const operation of operations) {
    try {
      await operation.check();
    } catch (error) {
      errors.push(
        new Error(
          `Candidate postflight ${operation.label}: ${error.message ?? String(error)}`,
          { cause: error },
        ),
      );
    }
  }
  return errors;
}

/** Starts only qualified static artifacts, delegates the explicit actual browser scope, then requalifies every binding even on failure. */
async function acquireCandidateBrowser({
  invocation,
  npmCandidate,
  nugetCandidate,
  qualifyNpm,
  qualifyNuget,
}) {
  const { candidateBrowserManifest } = await import(
    pathToFileURL(
      path.join(
        repository,
        'tools/conformance/dotnet/harness/candidate-browser-manifest.ts',
      ),
    ).href
  );
  const manifest = candidateBrowserManifest(invocation.mode);
  const raw = nugetCandidate.packagePointer;
  assert.ok(
    raw && path.isAbsolute(raw),
    'Qualified raw NuGet package pointer required',
  );
  assert.notEqual(
    raw,
    invocation.nugetMetadataPath,
    'Candidate binding wrapper cannot select the worker executable',
  );
  const pointers = [
    invocation.npmMetadataPath,
    invocation.nugetMetadataPath,
    raw,
  ];
  const anchors = Object.fromEntries(
    await Promise.all(
      pointers.map(async (file) => [file, digest(await readPhysical(file))]),
    ),
  );
  const evidence = await fs.realpath(
    await fs.mkdtemp(
      path.join(
        await fs.realpath(os.tmpdir()),
        `hashbrown-candidate-${invocation.mode}-`,
      ),
    ),
  );
  console.error(`CANDIDATE_BROWSER_EVIDENCE ${evidence}`);
  await fs.writeFile(
    path.join(evidence, 'manifest.json'),
    JSON.stringify({ mode: invocation.mode, records: manifest }, null, 2),
  );
  const servers = [];
  let errors = [];
  let status = -1;
  try {
    const { startLiveStaticServer } =
      await import('../harness/live-static-server.ts');
    const origins = {};
    for (const framework of ['react', 'angular']) {
      const server = await startLiveStaticServer(
        npmCandidate.artifacts[framework],
      );
      servers.push(server);
      origins[framework] = server.url;
    }
    const environment = candidateBrowserChildEnvironment(process.env, {
      ...invocation,
      packagePointer: raw,
      packagePointerSha256: anchors[raw],
      origins,
      evidenceDirectory: evidence,
    });
    environment.HASHBROWN_CANDIDATE_MANIFEST = JSON.stringify(manifest);
    const runtimeTimeoutMs =
      invocation.mode === 'pilot'
        ? 300_000
        : Math.min(manifest.length * 180_000 + 120_000, 4 * 60 * 60 * 1000);
    status = await launchPlaywright(environment, evidence, runtimeTimeoutMs);
    assert.equal(
      status,
      0,
      `Candidate browser failed; actual browser evidence: ${evidence}`,
    );
  } catch (error) {
    errors.push(error);
  } finally {
    for (const server of servers.reverse()) {
      try {
        await server.stop();
      } catch (error) {
        errors.push(error);
      }
    }
    errors = await candidateBrowserPostflight(
      {
        npm: () => qualifyNpm(invocation.npmMetadataPath),
        nuget: () => qualifyNuget(invocation.nugetMetadataPath),
        anchors: Object.entries(anchors).map(([file, hash]) => ({
          label: file,
          check: async () =>
            assert.equal(
              digest(await readPhysical(file)),
              hash,
              'Candidate pointer changed during browser execution',
            ),
        })),
      },
      errors,
    );
    await fs.writeFile(
      path.join(evidence, 'run-provenance.json'),
      JSON.stringify(
        {
          kind: 'source-candidate-browser',
          mode: invocation.mode,
          pointers: anchors,
          status,
          manifest,
          errors: errors.map((error) => error.stack ?? String(error)),
        },
        null,
        2,
      ),
    );
  }
  if (errors.length)
    throw new AggregateError(errors, `Candidate browser failed: ${evidence}`);
  return { kind: 'source-candidate-browser', mode: invocation.mode, evidence };
}

/** Fully qualifies both explicit source bindings before any runtime acquisition; never prepares or falls back. */
export async function runCandidateBrowser(invocation, seams) {
  const selected = parseCandidateBrowserInvocation([
    invocation.mode,
    `--npm-metadata=${invocation.npmMetadataPath}`,
    `--metadata=${invocation.nugetMetadataPath}`,
  ]);
  const qualification =
    seams ??
    (await import('./qualify.mjs').then((module) => ({
      qualifyNpm: module.qualifyNpmCandidate,
      qualifyNuget: module.qualifyNugetCandidate,
      acquire: acquireCandidateBrowser,
    })));
  const npmCandidate = await qualification.qualifyNpm(selected.npmMetadataPath);
  const nugetCandidate = await qualification.qualifyNuget(
    selected.nugetMetadataPath,
  );
  return qualification.acquire({
    invocation: selected,
    npmCandidate,
    nugetCandidate,
    qualifyNpm: qualification.qualifyNpm,
    qualifyNuget: qualification.qualifyNuget,
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(
      JSON.stringify(
        await runCandidateBrowser(
          parseCandidateBrowserInvocation(process.argv.slice(2)),
        ),
      ),
    );
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  }
}
