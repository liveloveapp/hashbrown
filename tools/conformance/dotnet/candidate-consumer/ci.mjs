import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { launchCandidateOwnedProcess } from './browser-runner.mjs';
import { repository } from './files.mjs';
import { candidateBrowserManifest } from '../harness/candidate-browser-manifest.ts';
import { validateCandidateBrowserResults } from '../harness/candidate-browser-reporter.ts';

const isolationIds = Object.freeze([
  'actual-candidate-public-contracts',
  'old-public-missing-api.core',
  'old-public-missing-api.react',
  'old-public-missing-api.angular',
  'missing-archive-with-usable-cache',
  'archive-tamper',
  'archive-symlink',
  'workspace-path-alias',
  'consumer-source-symlink',
  'installed-sdk-symlink',
  'added-consumer-source',
  'added-consumer-root.unreviewed.ts',
  'added-consumer-root.tsconfig.extra.json',
  'added-consumer-root..npmrc',
  'owned-npm-config-tamper',
  'added-producer-source',
  'descriptor-tamper',
  'metadata-source-hash-tamper',
  'nuget-role-substitution.library',
  'nuget-role-substitution.executable',
]);
const maximumRuntimeMs = 270 * 60_000;
const producerLogs = {
  npm: new Set(
    [
      'revision',
      'build-core',
      'build-react',
      'build-angular',
      'pack-core',
      'pack-react',
      'pack-angular',
      'npm-ci',
      'tsconfig.contracts.json',
      'react-tsconfig.json',
      'angular-tsconfig.json',
      'framework-build',
    ].map((name) => name + '.log'),
  ),
  nuget: new Set(
    [
      'revision',
      'sdk',
      'sdk-roots',
      'package-hash-build',
      'package-hashes',
      'source-restore',
      'pack',
      'consumer-restore',
      'consumer-locked-restore',
      'consumer-build',
      'api-build',
      'api-check',
      'evaluation',
      'preprocess',
      'public-smoke',
      'internal-negative',
      'qualification-smoke',
      'restore-sentinel-positive',
      'restore-negative',
      'published-signature',
      'published-hashes',
      'role-runtimes',
      ...['fixture', 'probe'].flatMap((role) =>
        ['restore', 'restore-locked', 'build', 'evaluation', 'preprocess'].map(
          (phase) => role + '-' + phase,
        ),
      ),
    ].map((name) => name + '.log'),
  ),
};

/** Requires an explicit normalized absolute path without aliases supplied as traversal. */
function absolute(value) {
  assert.ok(
    typeof value === 'string' &&
      path.isAbsolute(value) &&
      path.resolve(value) === value &&
      !value.includes('\0'),
    'Normalized absolute candidate pointer/path required',
  );
  return value;
}

/** Defines the exact independent Nx process order, immutable pointer bindings and finite phase budgets. */
export function candidateCiPlan(npmPointer, nugetPointer) {
  absolute(npmPointer);
  absolute(nugetPointer);
  assert.notEqual(
    npmPointer,
    nugetPointer,
    'Distinct candidate pointers required',
  );
  const shared = [`--npm-metadata=${npmPointer}`, `--metadata=${nugetPointer}`];
  return Object.freeze(
    [
      ['npm', 'prepare-candidate-npm', [`--metadata=${npmPointer}`], 600_000],
      [
        'nuget',
        'prepare-candidate-nuget',
        [`--metadata=${nugetPointer}`],
        600_000,
      ],
      ['isolation', 'candidate-consumer-check', shared, 600_000],
      ['browser', 'candidate-recovery-browser', shared, 14_400_000],
    ].map(([name, target, flags, timeoutMs]) =>
      Object.freeze({
        name,
        command: 'npx',
        args: Object.freeze([
          'nx',
          target,
          'dotnet-conformance',
          '--',
          ...flags,
        ]),
        timeoutMs,
      }),
    ),
  );
}

/** Rejects partial, renamed or invented isolation/browser results rather than inferring success from phase exit status. */
export function validateCandidateCiReceipts({ isolation, browser }) {
  assert.equal(
    isolation?.kind,
    'source-candidate-isolation',
    'Actual isolation receipt required',
  );
  assert.equal(isolation.schema, 1, 'Isolation schema required');
  assert.ok(Array.isArray(isolation.records), 'Isolation records required');
  assert.deepEqual(
    isolation.records.map((record) => record.id).sort(),
    [...isolationIds].sort(),
    'Exact isolation20 record identities required',
  );
  assert.ok(
    isolation.records.every((record) => record.status === 'passed'),
    'Every isolation record must pass',
  );
  assert.equal(
    isolation.nugetRestoreNegative?.status,
    'rejected',
    'Actual NuGet restore isolation rejection required',
  );
  assert.equal(
    browser?.kind,
    'source-candidate-browser',
    'Actual browser outcome receipt required',
  );
  assert.equal(browser.mode, 'all', 'Full browser all mode required');
  const manifest = candidateBrowserManifest('all');
  assert.equal(manifest.length, 372, 'Reviewed browser372 manifest required');
  assert.ok(
    Array.isArray(browser.manifest) && Array.isArray(browser.outcomes),
    'Actual browser manifest/outcomes required',
  );
  assert.deepEqual(
    browser.manifest.map((record) => record.id).sort(),
    manifest.map((record) => record.id).sort(),
    'Exact browser manifest identities required',
  );
  const validation = validateCandidateBrowserResults(
    manifest,
    browser.outcomes,
  );
  assert.equal(
    validation.passed,
    true,
    `Actual browser results failed: ${JSON.stringify(validation)}`,
  );
  assert.deepEqual(
    browser.validation,
    validation,
    'Reported browser result validation differs',
  );
  assert.deepEqual(
    browser.faults,
    [],
    'Browser reporter faults are not passing results',
  );
  assert.equal(
    browser.overallStatus,
    'passed',
    'Actual overall browser result must pass',
  );
}

/** Requires an actual owned physical path before reading or deleting selected evidence. */
async function physical(file, ownedRoot) {
  absolute(file);
  assert.ok(
    file === ownedRoot || file.startsWith(ownedRoot + path.sep),
    'Evidence path outside owned root',
  );
  assert.equal(
    await fs.realpath(file),
    file,
    'Evidence symlink/alias forbidden',
  );
  const info = await fs.lstat(file);
  assert.ok(!info.isSymbolicLink(), 'Evidence symlink forbidden');
  return info;
}

/** Copies only the finite candidate receipt vocabulary; consumer/cache/source trees are never uploaded. */
export async function exportCandidateCiEvidence({
  ownedRoot,
  outputDirectory,
  selections,
  maxFileBytes = 64 * 1024 * 1024,
  maxTotalBytes = 1024 * 1024 * 1024,
}) {
  absolute(ownedRoot);
  absolute(outputDirectory);
  assert.equal(
    await fs.realpath(ownedRoot),
    ownedRoot,
    'Physical owned evidence root required',
  );
  assert.ok(
    !outputDirectory.startsWith(ownedRoot + path.sep) &&
      outputDirectory !== ownedRoot,
    'Evidence output must survive owned cleanup',
  );
  for (const value of [maxFileBytes, maxTotalBytes])
    assert.ok(
      Number.isSafeInteger(value) && value > 0,
      'Positive evidence byte bound required',
    );
  await fs.mkdir(path.dirname(outputDirectory), { recursive: true });
  assert.equal(
    await fs.realpath(path.dirname(outputDirectory)),
    path.dirname(outputDirectory),
    'Physical output parent required',
  );
  await fs.mkdir(outputDirectory);
  const copied = [];
  const errors = [];
  const attempt = async (action) => {
    try {
      await action();
    } catch (error) {
      errors.push(error);
    }
  };
  let total = 0;
  const used = new Set();
  const ids = new Set(
    candidateBrowserManifest('all').map((record) => record.id),
  );
  const copy = async (source, relative) => {
    const info = await physical(source, ownedRoot);
    assert.ok(info.isFile(), 'Regular evidence file required');
    assert.ok(
      info.size <= maxFileBytes && total + info.size <= maxTotalBytes,
      'Evidence byte limit exceeded',
    );
    assert.ok(!used.has(relative), 'Duplicate evidence destination forbidden');
    const bytes = await fs.readFile(source);
    assert.equal(bytes.length, info.size, 'Evidence size changed during copy');
    assert.ok(
      bytes.length <= maxFileBytes && total + bytes.length <= maxTotalBytes,
      'Evidence byte limit exceeded',
    );
    const target = path.join(outputDirectory, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes, { flag: 'wx' });
    assert.equal(
      createHash('sha256')
        .update(await fs.readFile(target))
        .digest('hex'),
      createHash('sha256').update(bytes).digest('hex'),
      'Copied evidence hash differs',
    );
    total += bytes.length;
    used.add(relative);
    copied.push({
      file: relative,
      original: source,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  };
  const exportSelection = async (selection) => {
    const info = await physical(selection.root, ownedRoot);
    assert.ok(info.isDirectory(), 'Evidence selection directory required');
    const kind = selection.kind;
    assert.ok(
      ['browser', 'npm', 'nuget', 'isolation', 'pointers', 'phases'].includes(
        kind,
      ),
      'Unknown evidence selection kind',
    );
    const prefixes = {
      browser: 'hashbrown-candidate-all-',
      npm: 'hashbrown-candidate-browser-',
      nuget: 'hashbrown-nuget-consumer-',
      isolation: 'hashbrown-candidate-isolation-',
    };
    if (kind !== 'pointers' && kind !== 'phases')
      assert.ok(
        path.basename(selection.root).startsWith(prefixes[kind]),
        'Unexpected evidence root prefix',
      );
    if (kind === 'pointers')
      assert.equal(
        selection.root,
        ownedRoot,
        'Owned pointer directory required',
      );
    if (kind === 'phases')
      assert.equal(
        selection.root,
        path.join(ownedRoot, 'phase-logs'),
        'Owned phase log directory required',
      );
    if (kind === 'browser') {
      const walk = async (directory, relative = '') => {
        for (const entry of await fs.readdir(directory, {
          withFileTypes: true,
        })) {
          await attempt(async () => {
            const name = relative ? relative + '/' + entry.name : entry.name;
            const file = path.join(directory, entry.name);
            await physical(file, ownedRoot);
            if (entry.isDirectory()) {
              assert.ok(
                ids.has(name) ||
                  /^(playwright|playwright-output)(\/[^/.][^/]*)*$/.test(name),
                'Unexpected evidence directory not allowlisted',
              );
              await walk(file, name);
            } else {
              const parts = name.split('/');
              const top = parts[0];
              const allowed =
                parts.length === 1
                  ? /^(manifest\.json|outcomes\.json|run-provenance\.json|spawns\.jsonl|playwright\.log|observer-positive-control\.json|observer-positive\.jsonl|observer-positive-proxy\.jsonl|observer-worker-\d+\.json)$/.test(
                      name,
                    )
                  : ids.has(top) && parts.length === 2
                    ? /^(journey\.json|observer\.jsonl|proxy\.jsonl|worker-\d+-[a-f0-9-]+\.json)$/.test(
                        parts[1],
                      )
                    : /^(playwright|playwright-output)\//.test(name) &&
                      /\/(trace\.zip|test-failed-\d+\.png|[a-f0-9]+\.webm|video\.webm|error-context\.md|\.last-run\.json)$/.test(
                        name,
                      );
              assert.ok(
                allowed,
                `Unexpected evidence file not allowlisted: ${name}`,
              );
              await copy(file, 'browser/' + name);
            }
          });
        }
      };
      await walk(selection.root);
    } else {
      const paths =
        kind === 'phases'
          ? ['npm.log', 'nuget.log', 'isolation.log', 'browser.log']
          : kind === 'pointers'
            ? [
                'npm.json',
                'npm.json.sha256',
                'nuget.json',
                'nuget.json.sha256',
                'nuget.json.source-package',
                'nuget.json.source-package.sha256',
              ]
            : kind === 'npm'
              ? ['candidate-metadata.json']
              : kind === 'nuget'
                ? [
                    'candidate-browser-binding.json',
                    'metadata.json',
                    'public-api.json',
                    'loaded.json',
                  ]
                : [
                    'isolation-evidence.json',
                    'candidate-typecheck.log',
                    'old-core/logs/missing-feature.log',
                    'old-react/logs/missing-feature.log',
                    'old-angular/logs/missing-feature.log',
                    'usable-cache-sentinel/logs/usable-candidate.log',
                  ];
      if (kind === 'npm' || kind === 'nuget') {
        const logDirectory = path.join(selection.root, 'logs');
        try {
          await physical(logDirectory, ownedRoot);
          for (const entry of await fs.readdir(logDirectory)) {
            if (producerLogs[kind].has(entry)) paths.push('logs/' + entry);
            else
              errors.push(
                new Error(`Unexpected producer log not allowlisted: ${entry}`),
              );
          }
        } catch (error) {
          if (error.code !== 'ENOENT') errors.push(error);
        }
      }
      for (const relative of paths) {
        await attempt(async () => {
          try {
            await fs.lstat(path.join(selection.root, relative));
          } catch (error) {
            if (error.code === 'ENOENT') return;
            throw error;
          }
          await copy(
            path.join(selection.root, relative),
            kind + '/' + relative,
          );
        });
      }
    }
  };
  for (const selection of selections)
    await attempt(() => exportSelection(selection));
  if (errors.length) {
    const error = new AggregateError(
      errors,
      `Candidate evidence export failed: ${errors.map((item) => item.message ?? String(item)).join('; ')}`,
    );
    error.files = copied;
    throw error;
  }
  return copied;
}

/** Discovers only known directly owned producer roots; discovery never makes a file upload-eligible. */
async function selections(context) {
  const result = [
    { kind: 'pointers', root: context.ownedRoot },
    { kind: 'phases', root: context.phaseLogDirectory },
  ];
  for (const entry of await fs.readdir(context.ownedRoot, {
    withFileTypes: true,
  })) {
    const kind = entry.name.startsWith('hashbrown-candidate-all-')
      ? 'browser'
      : entry.name.startsWith('hashbrown-candidate-browser-')
        ? 'npm'
        : entry.name.startsWith('hashbrown-nuget-consumer-')
          ? 'nuget'
          : entry.name.startsWith('hashbrown-candidate-isolation-')
            ? 'isolation'
            : undefined;
    if (kind)
      result.push({ kind, root: path.join(context.ownedRoot, entry.name) });
  }
  return result;
}

/** Requires the complete actual successful support inventory and its immutable pointer/worker joins before success can be reported. */
async function requireSuccessfulEvidence(context, selected) {
  const rootFor = (kind) => {
    const matches = selected.filter((item) => item.kind === kind);
    assert.equal(
      matches.length,
      1,
      `Exactly one actual ${kind} evidence root required`,
    );
    return matches[0].root;
  };
  const required = async (file) => {
    const info = await physical(file, context.ownedRoot);
    assert.ok(
      info.isFile() && info.size > 0 && info.size <= 64 * 1024 * 1024,
      'Required supporting evidence file missing/empty/oversized',
    );
    return fs.readFile(file);
  };
  const json = async (file) =>
    JSON.parse((await required(file)).toString('utf8'));
  const lines = async (file) =>
    (await required(file))
      .toString('utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
  const npmRoot = rootFor('npm');
  const nugetRoot = rootFor('nuget');
  const browserRoot = rootFor('browser');
  const isolationRoot = rootFor('isolation');
  const rawPointer = context.nugetPointer + '.source-package';
  const anchors = {};
  for (const [pointer, metadataPath] of [
    [context.npmPointer, path.join(npmRoot, 'candidate-metadata.json')],
    [
      context.nugetPointer,
      path.join(nugetRoot, 'candidate-browser-binding.json'),
    ],
    [rawPointer, path.join(nugetRoot, 'metadata.json')],
  ]) {
    const bytes = await required(pointer);
    const hash = createHash('sha256').update(bytes).digest('hex');
    assert.equal(
      (await required(pointer + '.sha256')).toString('utf8').trim(),
      hash,
      'Actual pointer anchor differs',
    );
    const fact = JSON.parse(bytes.toString('utf8'));
    assert.equal(
      fact.metadata,
      metadataPath,
      'Fresh pointer metadata binding differs',
    );
    assert.equal(
      fact.sha256,
      createHash('sha256')
        .update(await required(metadataPath))
        .digest('hex'),
      'Actual metadata hash differs',
    );
    anchors[pointer] = hash;
  }
  const binding = await json(
    path.join(nugetRoot, 'candidate-browser-binding.json'),
  );
  assert.equal(
    binding.packagePointer,
    rawPointer,
    'Fresh raw NuGet pointer binding differs',
  );
  assert.equal(
    binding.packagePointerSha256,
    anchors[rawPointer],
    'Raw NuGet pointer hash differs',
  );
  const expected = candidateBrowserManifest('all');
  const manifest = await json(path.join(browserRoot, 'manifest.json'));
  assert.deepEqual(
    manifest,
    { mode: 'all', records: expected },
    'Actual all-mode support manifest differs',
  );
  const provenance = await json(path.join(browserRoot, 'run-provenance.json'));
  assert.equal(
    provenance.kind,
    'source-candidate-browser',
    'Actual browser provenance required',
  );
  assert.equal(provenance.mode, 'all', 'Actual full provenance mode required');
  assert.equal(
    provenance.status,
    0,
    'Actual successful browser process status required',
  );
  assert.deepEqual(
    provenance.errors,
    [],
    'Browser postflight/cleanup faults cannot qualify',
  );
  assert.deepEqual(
    provenance.manifest,
    expected,
    'Browser provenance manifest differs',
  );
  assert.deepEqual(
    provenance.pointers,
    anchors,
    'Browser provenance must retain the exact fresh pointer identities',
  );
  const isolation = await json(
    path.join(isolationRoot, 'isolation-evidence.json'),
  );
  assert.equal(
    isolation.npmMetadataPath,
    context.npmPointer,
    'Actual isolation npm pointer differs',
  );
  assert.equal(
    isolation.nugetMetadataPath,
    context.nugetPointer,
    'Actual isolation NuGet pointer differs',
  );
  validateCandidateCiReceipts({
    isolation,
    browser: await json(path.join(browserRoot, 'outcomes.json')),
  });
  const spawns = await lines(path.join(browserRoot, 'spawns.jsonl'));
  assert.ok(
    spawns.some((record) => record.event === 'verified-loaded'),
    'Actual loaded-worker spawn receipts required',
  );
  await required(path.join(browserRoot, 'playwright.log'));
  const workerProof = async (file, process, loaded) => {
    const proof = await json(file);
    assert.deepEqual(proof.process, process, 'Worker process evidence differs');
    assert.ok(
      proof.loaded && typeof proof.diagnostics === 'string',
      'Actual loaded worker identity/diagnostics required',
    );
    if (loaded !== undefined)
      assert.deepEqual(
        proof.loaded,
        loaded,
        'Positive-control loaded identity differs',
      );
    assert.ok(
      spawns.some(
        (record) =>
          record.event === 'verified-loaded' &&
          record.descriptor === anchors[rawPointer] &&
          record.executable === process.executable &&
          isDeepStrictEqual(record.loaded, proof.loaded),
      ),
      'Worker loaded identity missing from actual spawn receipts',
    );
  };
  for (const record of expected) {
    const directory = path.join(browserRoot, record.id);
    const journey = await json(path.join(directory, 'journey.json'));
    assert.equal(
      journey.kind,
      'actual-source-candidate-browser-journey',
      'Actual per-row journey evidence required',
    );
    assert.deepEqual(journey.record, record, 'Per-row identity differs');
    assert.ok(!journey.failure, 'Failed journey cannot qualify');
    assert.deepEqual(
      journey.cleanupErrors,
      [],
      'Per-row cleanup failure cannot qualify',
    );
    assert.ok(
      Array.isArray(journey.workers) && journey.workers.length > 0,
      'Actual per-row worker evidence required',
    );
    await lines(path.join(directory, 'observer.jsonl'));
    await lines(path.join(directory, 'proxy.jsonl'));
    const files = await fs.readdir(directory);
    for (const worker of journey.workers) {
      assert.ok(
        Number.isSafeInteger(worker.process?.pid) &&
          worker.process.pid > 0 &&
          worker.evidence?.workerId &&
          worker.evidence.faulted === false,
        'Actual worker receipt identity required',
      );
      const names = files.filter((name) =>
        new RegExp(`^worker-${worker.process.pid}-[a-f0-9-]+[.]json$`).test(
          name,
        ),
      );
      assert.equal(
        names.length,
        1,
        'Exactly one referenced loaded worker identity file required',
      );
      await workerProof(path.join(directory, names[0]), worker.process);
    }
  }
  const positive = await json(
    path.join(browserRoot, 'observer-positive-control.json'),
  );
  assert.equal(
    positive.kind,
    'actual-browser-handler-observer-positive-control',
    'Actual observer positive control required',
  );
  assert.equal(
    positive.computations,
    2,
    'Two actual positive-control operations required',
  );
  assert.ok(!positive.failure, 'Positive-control failure cannot qualify');
  assert.deepEqual(
    positive.cleanupErrors,
    [],
    'Positive-control cleanup failure cannot qualify',
  );
  assert.deepEqual(
    positive.pageErrors,
    [],
    'Positive-control browser failure cannot qualify',
  );
  assert.ok(
    Array.isArray(positive.records) && positive.records.length === 2,
    'Both positive-control worker receipts required',
  );
  for (const record of positive.records)
    await workerProof(
      path.join(
        browserRoot,
        `observer-worker-${record.loadedWorker.process.pid}.json`,
      ),
      record.loadedWorker.process,
      record.loadedWorker.loaded,
    );
  await lines(path.join(browserRoot, 'observer-positive.jsonl'));
  await lines(path.join(browserRoot, 'observer-positive-proxy.jsonl'));
}

/** Runs fresh preparation, isolation and the full matrix once, preserving original, export and cleanup errors independently. */
export async function runCandidateCi({ evidenceDirectory }, seams = {}) {
  absolute(evidenceDirectory);
  await fs.mkdir(path.dirname(evidenceDirectory), { recursive: true });
  assert.equal(
    await fs.realpath(path.dirname(evidenceDirectory)),
    path.dirname(evidenceDirectory),
    'Physical evidence output parent required',
  );
  await fs.mkdir(evidenceDirectory);
  const ownedRoot = await fs.realpath(
    await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), 'hashbrown-candidate-ci-'),
    ),
  );
  const errors = [];
  const report = {
    kind: 'source-candidate-ci',
    status: 'failed',
    phases: [],
    files: [],
    errors: [],
    signals: [],
    signalCount: 0,
  };
  const onSignal = (signal) => {
    report.signalCount++;
    if (report.signals.length < 16) report.signals.push(signal);
    if (report.signalCount === 1)
      errors.push(new Error(`Candidate CI interrupted by ${signal}`));
  };
  const signalListeners = {
    SIGINT: () => onSignal('SIGINT'),
    SIGTERM: () => onSignal('SIGTERM'),
  };
  for (const [signal, listener] of Object.entries(signalListeners))
    process.on(signal, listener);
  let cleanupAttempted = false;
  try {
    const environment = {};
    for (const key of [
      'PATH',
      'LANG',
      'LC_ALL',
      'SystemRoot',
      'WINDIR',
      'DOTNET_ROOT',
      'DOTNET_HOST_PATH',
      'DOTNET_TEST_POSTGRES',
    ])
      if (typeof process.env[key] === 'string')
        environment[key] = process.env[key];
    Object.assign(environment, {
      TMPDIR: ownedRoot,
      TMP: ownedRoot,
      TEMP: ownedRoot,
      NX_DAEMON: 'false',
    });
    const phaseLogDirectory = path.join(ownedRoot, 'phase-logs');
    await fs.mkdir(phaseLogDirectory);
    const context = Object.freeze({
      ownedRoot,
      evidenceDirectory,
      phaseLogDirectory,
      npmPointer: path.join(ownedRoot, 'npm.json'),
      nugetPointer: path.join(ownedRoot, 'nuget.json'),
      environment: Object.freeze(environment),
    });
    const started = performance.now();
    const executePhase =
      seams.executePhase ??
      (async (phase, current) =>
        launchCandidateOwnedProcess({
          command: phase.command,
          args: phase.args,
          cwd: repository,
          environment: current.environment,
          logPath: path.join(current.phaseLogDirectory, phase.name + '.log'),
          // The browser runner owns a second detached group: let its TERM10 + drain10 + pipe10 envelope finish first.
          terminationGraceMs: 60_000,
          drainTimeoutMs: 10_000,
          runtimeTimeoutMs: Math.min(
            phase.timeoutMs,
            Math.floor(maximumRuntimeMs - (performance.now() - started)),
          ),
        }));
    try {
      for (const phase of candidateCiPlan(
        context.npmPointer,
        context.nugetPointer,
      )) {
        const record = {
          name: phase.name,
          argv: [phase.command, ...phase.args],
          status: null,
          milliseconds: 0,
        };
        report.phases.push(record);
        const phaseStarted = performance.now();
        try {
          assert.ok(
            report.signalCount === 0,
            'Cancelled candidate CI cannot schedule another phase',
          );
          assert.ok(
            performance.now() - started < maximumRuntimeMs,
            'Candidate CI overall deadline exceeded',
          );
          record.status = await executePhase(phase, context);
          assert.equal(
            record.status,
            0,
            `Candidate CI ${phase.name} phase failed with status ${record.status}`,
          );
        } finally {
          record.milliseconds = performance.now() - phaseStarted;
        }
      }
      const selected = await selections(context);
      const isolation = selected.filter((item) => item.kind === 'isolation');
      const browser = selected.filter((item) => item.kind === 'browser');
      assert.equal(
        isolation.length,
        1,
        'Exactly one actual isolation report required',
      );
      assert.equal(
        browser.length,
        1,
        'Exactly one actual browser outcome report required',
      );
      validateCandidateCiReceipts({
        isolation: JSON.parse(
          await fs.readFile(
            path.join(isolation[0].root, 'isolation-evidence.json'),
            'utf8',
          ),
        ),
        browser: JSON.parse(
          await fs.readFile(
            path.join(browser[0].root, 'outcomes.json'),
            'utf8',
          ),
        ),
      });
      await requireSuccessfulEvidence(context, selected);
    } catch (error) {
      errors.push(error);
    } finally {
      try {
        report.files = await (
          seams.exportEvidence ??
          (async (current) =>
            exportCandidateCiEvidence({
              ownedRoot: current.ownedRoot,
              outputDirectory: path.join(evidenceDirectory, 'receipts'),
              selections: await selections(current),
            }))
        )(context);
      } catch (error) {
        if (Array.isArray(error.files)) report.files = error.files;
        errors.push(error);
      }
      try {
        cleanupAttempted = true;
        await (
          seams.cleanup ??
          (async (current) => {
            assert.equal(
              await fs.realpath(current.ownedRoot),
              ownedRoot,
              'Owned cleanup alias changed',
            );
            await fs.rm(ownedRoot, { recursive: true, force: true });
          })
        )(context);
      } catch (error) {
        errors.push(error);
      }
      let reportedErrors;
      let firstWrite = true;
      do {
        reportedErrors = errors.length;
        report.status = errors.length ? 'failed' : 'passed';
        report.errors = errors.map((error) => error.stack ?? String(error));
        try {
          await fs.writeFile(
            path.join(evidenceDirectory, 'ci-summary.json'),
            JSON.stringify(report, null, 2) + '\n',
            firstWrite ? { flag: 'wx' } : undefined,
          );
          firstWrite = false;
        } catch (error) {
          errors.push(error);
          break;
        }
      } while (reportedErrors !== errors.length);
    }
  } catch (error) {
    errors.push(error);
  } finally {
    if (!cleanupAttempted) {
      try {
        await fs.rm(ownedRoot, { recursive: true, force: true });
      } catch (error) {
        errors.push(error);
      }
    }
    for (const [signal, listener] of Object.entries(signalListeners))
      process.off(signal, listener);
  }
  if (errors.length)
    throw new AggregateError(
      errors,
      'Candidate CI phase/evidence/cleanup failed',
    );
  return report;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    assert.equal(
      process.argv.length,
      3,
      'One explicit --evidence argument required',
    );
    assert.ok(
      process.argv[2].startsWith('--evidence='),
      'Explicit --evidence path required',
    );
    console.log(
      JSON.stringify(
        await runCandidateCi({
          evidenceDirectory: process.argv[2].slice('--evidence='.length),
        }),
      ),
    );
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  }
}
