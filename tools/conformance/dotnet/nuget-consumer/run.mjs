import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashFile, verifyConsumer, readArchive } from './verify.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../../../..');
const baselineRevision = '8f0a710a75cb907c1a07e34eb5527b1834da90ed';
const maximumLogBytes = 4 * 1024 * 1024;
const maximumStructuredBytes = 8 * 1024 * 1024;

/** Recognizes SHA256 file facts, excluding dotted scalar credential names. */
function isFileHash(key, value) {
  return (
    typeof value === 'string' &&
    /^[a-f0-9]{64}$/i.test(value) &&
    (/\.dll$/i.test(key) || /[\\/][^\\/]+\.[a-z0-9_]+$/i.test(key))
  );
}

/** Removes credentials and bounds diagnostic strings without serializing process environments. */
export function sanitize(value) {
  if (typeof value === 'string') {
    if (value.length <= maximumLogBytes && /^\s*[[{]/.test(value)) {
      let structured;
      try {
        structured = JSON.parse(value);
      } catch {
        // Partial diagnostics still receive the bounded text redaction below.
      }
      if (structured)
        return JSON.stringify(sanitize(structured)).slice(0, maximumLogBytes);
    }
    return value
      .replace(
        /("(?!publickeytoken")(?:password|api.?key|authorization|[a-z][a-z0-9_]*token|token)"\s*:\s*")[^"]*/gi,
        '$1[redacted]',
      )
      .replace(
        /(\bAuthorization\s*[:=]\s*)(?:Bearer\s+)?[^\r\n;,]+/gi,
        '$1[redacted]',
      )
      .replace(/(\bBearer\s+)[^\s;,"']+/gi, '$1[redacted]')
      .replace(
        /(\b(?:Password|ApiKey|token)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s;,"']+)/gi,
        '$1[redacted]',
      )
      .slice(0, maximumLogBytes);
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key, item]) =>
            isFileHash(key, item) ||
            !/environment|password|secret|authorization|api.?key/i.test(key),
        )
        .map(([key, item]) => [
          key,
          key.toLowerCase() !== 'publickeytoken' &&
          /^(?:[a-z][a-z0-9_]*token|token)$/i.test(key)
            ? '[redacted]'
            : sanitize(item),
        ]),
    );
  return value;
}

/** Rejects absent or substituted original baselines and absent candidate descriptors. */
export async function validateAcceptanceInputs(root, pointer) {
  const manifest = JSON.parse(
    await fs.readFile(
      path.join(
        root,
        'tools/conformance/dotnet/tests/fixtures/pre-extraction-host.json',
      ),
      'utf8',
    ),
  );
  assert.equal(
    manifest.revision,
    baselineRevision,
    'Expected immutable baseline required',
  );
  assert.equal(
    Object.keys(manifest.files).length,
    66,
    'Expected complete original source baseline',
  );
  if (pointer)
    return verifyConsumer(JSON.parse(await fs.readFile(pointer, 'utf8')));
}

/** Runs sequential bounded child processes exactly once, retaining failure status before throwing. */
export async function executePhases(
  phases,
  directory,
  report,
  environment = process.env,
) {
  for (const phase of phases) {
    const started = Date.now();
    const record = {
      name: phase.name,
      argv: phase.argv,
      status: null,
      milliseconds: 0,
    };
    report.phases.push(record);
    let output = '';
    const status = await new Promise((accept, reject) => {
      const child = spawn(process.execPath, phase.argv, {
        cwd: repository,
        env: environment,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let timedOut = false;
      const timer = setTimeout(
        () => {
          timedOut = true;
          if (process.platform === 'win32') child.kill('SIGKILL');
          else {
            try {
              process.kill(-child.pid, 'SIGKILL');
            } catch {
              /* Already exited. */
            }
          }
        },
        Math.min(
          phase.timeout,
          report.deadline
            ? Math.max(1, report.deadline - Date.now())
            : phase.timeout,
        ),
      );
      const capture = (chunk) => {
        output = (output + chunk.toString()).slice(-maximumLogBytes);
      };
      child.stdout.on('data', capture);
      child.stderr.on('data', capture);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        accept(timedOut ? 'timeout' : (code ?? 'signal'));
      });
    });
    record.status = status;
    record.milliseconds = Date.now() - started;
    await fs.writeFile(
      path.join(directory, `${phase.name}.log`),
      sanitize(output),
    );
    await fs.writeFile(
      path.join(directory, 'phases.json'),
      JSON.stringify(report, null, 2),
    );
    assert.equal(
      status,
      0,
      `${phase.name} failed (${status}); diagnostics: ${directory}`,
    );
    if (phase.after) await phase.after(output);
    console.log(
      `Package acceptance ${phase.name}: passed (${record.milliseconds}ms)`,
    );
  }
}

/** Selects the final emitted JSON record and requires the prepared physical installation. */
export function preparedRecord(output, field) {
  const lines = output.split(/\r?\n/).reverse();
  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record && typeof record[field] === 'string') return record;
  }
  throw Error(`Missing prepared ${field} record`);
}

/** Defines the closed ordered acceptance graph; every command is executed at most once. */
export function acceptancePlan(
  pointer,
  npmMetadata,
  profile = 'full',
  imported = {},
) {
  const publicArgs = publishedArguments(imported);
  assert.ok(
    !publicArgs.length || profile === 'full',
    'Public archives require full acceptance',
  );
  assert.ok(
    profile === 'full' || profile === 'pr',
    'Explicit acceptance profile required',
  );
  const metadata = ['--metadata', pointer];
  const shared = [...metadata, '--npm-metadata', npmMetadata];
  const browser = [
    path.join(repository, 'node_modules/tsx/dist/cli.mjs'),
    path.join(here, 'browser-runner.mjs'),
  ];
  const phase = (name, argv, minutes) => ({
    name,
    argv,
    timeout: minutes * 60_000,
  });
  return [
    phase(
      'candidate',
      [path.join(here, 'prepare.mjs'), ...metadata, ...publicArgs],
      10,
    ),
    phase('npm', [path.join(here, '../live-consumer/prepare.mjs')], 10),
    phase(
      'initial-qualification',
      [path.join(here, 'qualify.mjs'), ...metadata],
      3,
    ),
    phase(
      'docs',
      [path.join(here, '../verify-recipe.mjs'), '--all', ...metadata],
      10,
    ),
    phase(
      'upgrade',
      [path.join(here, 'recovery-upgrade-runner.mjs'), ...metadata],
      25,
    ),
    profile === 'pr'
      ? phase('smoke', [...browser, ...shared, '--smoke'], 15)
      : phase('matrix', [...browser, ...shared], 60),
    phase('regressions', [...browser, ...shared, '--regressions'], 7),
    phase(
      'final-qualification',
      [path.join(here, 'qualify.mjs'), ...metadata],
      3,
    ),
    phase(
      'final-npm-qualification',
      [path.join(here, '../live-consumer/qualify.mjs'), npmMetadata],
      3,
    ),
  ];
}

/** Records bounded export failures without raw fragments or parser exception snippets. */
function exportError(errors, file, code) {
  if (errors.length < 100) errors.push({ file: sanitize(file), code });
}

/** Exports bounded parsed evidence; incomplete records become safe diagnostic markers. */
export async function exportDiagnosticFile(
  source,
  target,
  errors,
  name = path.basename(target),
) {
  try {
    const stat = await fs.lstat(source);
    const maximumBytes = /\.(json|jsonl)$/.test(source)
      ? maximumStructuredBytes
      : maximumLogBytes;
    assert.ok(
      stat.isFile() && !stat.isSymbolicLink() && stat.size <= maximumBytes,
    );
    const text = await fs.readFile(source, 'utf8');
    let output;
    if (source.endsWith('.jsonl')) {
      output =
        text
          .split('\n')
          .filter(Boolean)
          .map((line, index) => {
            try {
              return JSON.stringify(sanitize(JSON.parse(line)));
            } catch {
              exportError(errors, name, 'INVALID_JSONL');
              return JSON.stringify({
                diagnosticError: 'INVALID_JSONL',
                line: index + 1,
              });
            }
          })
          .join('\n') + '\n';
    } else if (source.endsWith('.json')) {
      try {
        output = JSON.stringify(sanitize(JSON.parse(text)), null, 2) + '\n';
      } catch {
        exportError(errors, name, 'INVALID_JSON');
        output = JSON.stringify({ diagnosticError: 'INVALID_JSON' }) + '\n';
      }
    } else {
      // Child logs can contain incomplete JSON and assertion or parser snippets.
      // Retain their text privately and export only integrity/location facts.
      output =
        JSON.stringify({
          privateLog: source,
          bytes: stat.size,
          sha256: await hashFile(source),
        }) + '\n';
    }
    assert.ok(Buffer.byteLength(output) <= maximumBytes);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, output);
  } catch (error) {
    exportError(
      errors,
      name,
      error.code === 'ENOENT' ? 'MISSING_ARTIFACT' : 'EXPORT_FAILED',
    );
  }
}

/** Publishes sanitized derivatives independently from the private child evidence tree. */
export async function exportDiagnostics(source, target, errors, relative = '') {
  let entries;
  try {
    entries = await fs.readdir(path.join(source, relative), {
      withFileTypes: true,
    });
  } catch {
    exportError(errors, relative || '.', 'MISSING_EVIDENCE');
    return;
  }
  for (const entry of entries) {
    const name = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) {
      exportError(errors, name, 'SYMLINK_EVIDENCE');
      continue;
    }
    if (entry.isDirectory())
      await exportDiagnostics(source, target, errors, name);
    else if (/\.(json|jsonl|log)$/.test(entry.name))
      await exportDiagnosticFile(
        path.join(source, name),
        path.join(target, name),
        errors,
        name,
      );
  }
}

/** Exports candidate facts without allowing missing or changed outputs to prevent final reporting. */
async function exportCandidate(candidate, directory, report) {
  const errors = report.exportErrors;
  const provenance = JSON.stringify(sanitize(candidate), null, 2);
  assert.ok(Buffer.byteLength(provenance) <= maximumStructuredBytes);
  await fs.writeFile(
    path.join(directory, 'candidate-provenance.json'),
    provenance,
  );
  let files = [];
  try {
    files = await fs.readdir(path.join(candidate.root, 'candidate-feed'));
  } catch {
    exportError(errors, 'candidate-feed', 'MISSING_ARTIFACT');
  }
  report.archives = {};
  for (const file of files.filter((name) => /\.(nupkg|snupkg)$/.test(name))) {
    const relative = 'candidate-feed/' + file;
    try {
      const source = path.join(candidate.root, relative);
      const digest = await hashFile(source);
      assert.equal(
        digest,
        candidate.files?.[relative],
        'Archive must match its immutable selected hash',
      );
      await fs.copyFile(source, path.join(directory, file));
      report.archives[file] = digest;
    } catch {
      exportError(errors, file, 'UNTRUSTED_ARCHIVE');
    }
  }
  if (
    Object.keys(report.archives).filter((name) => name.endsWith('.nupkg'))
      .length !== 1 ||
    Object.keys(report.archives).filter((name) => name.endsWith('.snupkg'))
      .length !== 1
  )
    exportError(errors, 'candidate-feed', 'MISSING_ARCHIVES');
  for (const [name, relative] of Object.entries({
    assets: 'app/obj/project.assets.json',
    deps: 'app/bin/Release/net10.0/Consumer.deps.json',
    lock: 'app/packages.lock.json',
    'public-api': 'public-api.json',
  }))
    await exportDiagnosticFile(
      path.join(candidate.root, relative),
      path.join(directory, name + '.json'),
      errors,
      relative,
    );
  try {
    assert.ok(
      report.archives[path.basename(candidate.archive)],
      'Qualified archive required',
    );
    const entries = readArchive(
      await fs.readFile(path.join(candidate.root, candidate.archive)),
    );
    for (const [name, bytes] of Object.entries(entries))
      if (name.endsWith('.nuspec'))
        await fs.writeFile(
          path.join(directory, 'candidate.nuspec'),
          sanitize(bytes.toString()),
        );
  } catch {
    exportError(errors, 'candidate.nuspec', 'MISSING_OR_UNTRUSTED_NUSPEC');
  }
  let directories = [];
  try {
    directories = (await fs.readdir(candidate.root)).filter((name) =>
      name.startsWith('docs-'),
    );
  } catch {
    exportError(errors, 'docs', 'MISSING_ARTIFACT');
  }
  for (const name of directories) {
    try {
      for (const file of await fs.readdir(path.join(candidate.root, name)))
        if (/^(qualified-\d+|declared-programs)\.json$/.test(file))
          await exportDiagnosticFile(
            path.join(candidate.root, name, file),
            path.join(directory, name, file),
            errors,
            name + '/' + file,
          );
    } catch {
      exportError(errors, name, 'EXPORT_FAILED');
    }
  }
}

/** Preserves failure identity without publishing JSON parser snippets. */
function failureMessage(error) {
  return error instanceof SyntaxError
    ? 'Invalid JSON evidence'
    : sanitize(error.message);
}

/** Selects only the full or bounded PR profile; candidate reuse and arbitrary phase selection remain forbidden. */
export function acceptanceProfile(args) {
  if (args.length === 0) return 'full';
  assert.deepEqual(
    args,
    ['--pr'],
    'Package acceptance accepts no candidate reuse or phase-selection arguments',
  );
  return 'pr';
}

/** Validates the closed pair of absolute public and qualified archive paths. */
export function publishedArguments(options = {}) {
  const keys = Object.keys(options).filter((key) => key !== 'profile');
  if (!keys.length) return [];
  assert.deepEqual(
    keys.sort(),
    ['publishedArchive', 'qualifiedArchive'],
    'Both archive arguments required',
  );
  for (const key of keys)
    assert.ok(
      typeof options[key] === 'string' &&
        path.isAbsolute(options[key]) &&
        options[key].endsWith('.nupkg'),
      'Archive must be absolute',
    );
  assert.notEqual(
    path.resolve(options.publishedArchive),
    path.resolve(options.qualifiedArchive),
    'Distinct archives required',
  );
  return [
    '--published-archive',
    options.publishedArchive,
    '--qualified-archive',
    options.qualifiedArchive,
  ];
}

/** Selects the closed full public import mode or the unchanged source profiles. */
export function acceptanceOptions(args) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--pr'))
    return { profile: acceptanceProfile(args) };
  assert.ok(
    args.length === 4 &&
      args[0] === '--published-archive' &&
      args[2] === '--qualified-archive',
    'Both archive arguments required; candidate reuse is forbidden',
  );
  const options = {
    profile: 'full',
    publishedArchive: args[1],
    qualifiedArchive: args[3],
  };
  publishedArguments(options);
  return options;
}

/** Qualifies one fresh candidate through every approved external consumer acceptance boundary. */
export async function runAcceptance() {
  const imported = acceptanceOptions(process.argv.slice(2));
  const { profile } = imported;
  await validateAcceptanceInputs(repository);
  const temporary = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'hashbrown-package-gate-')),
  );
  const directory = path.join(
    repository,
    'test-results/dotnet-package',
    path.basename(temporary),
  );
  await fs.mkdir(path.dirname(directory), { recursive: true });
  const uploadRoot = await fs.realpath(path.dirname(directory));
  assert.ok(
    temporary !== uploadRoot && !temporary.startsWith(uploadRoot + path.sep),
    'Private raw evidence must remain outside the upload tree',
  );
  await fs.mkdir(directory, { recursive: true });
  const pointer = path.join(temporary, 'candidate.json');
  const report = {
    schema: 1,
    profile,
    started: new Date().toISOString(),
    phases: [],
    status: 'failed',
    deadline: Date.now() + 85 * 60_000,
    packInvocations: 0,
    npmPreparations: 0,
    exportErrors: [],
  };
  let failure;
  let candidate;
  let npm;
  const environment = {
    ...process.env,
    HASHBROWN_PACKAGE_EVIDENCE_DIRECTORY: path.join(temporary, 'browser'),
    HASHBROWN_UPGRADE_EVIDENCE_DIRECTORY: path.join(temporary, 'upgrade'),
  };
  const started = Date.now();
  const save = async () =>
    fs.writeFile(
      path.join(directory, 'acceptance.json'),
      JSON.stringify(
        sanitize({ ...report, milliseconds: Date.now() - started }),
        null,
        2,
      ) + '\n',
    );
  try {
    const preparation = acceptancePlan(pointer, '', profile, imported).slice(
      0,
      2,
    );
    preparation[0].after = async () => {
      if (!imported.publishedArchive) report.packInvocations++;
      candidate = await validateAcceptanceInputs(repository, pointer);
      report.candidate = {
        root: candidate.root,
        archive: candidate.archive,
        sha256: candidate.sha256,
        loaded: candidate.loaded,
        descriptorSha256: await hashFile(pointer),
      };
    };
    preparation[1].after = async (output) => {
      report.npmPreparations++;
      npm = preparedRecord(output, 'metadataPath');
      assert.ok(
        path.isAbsolute(npm.metadataPath),
        'Absolute npm metadata required',
      );
      await fs.access(npm.metadataPath);
      report.npm = npm;
    };
    await executePhases(preparation, temporary, report, environment);
    await executePhases(
      acceptancePlan(pointer, npm.metadataPath, profile).slice(2),
      temporary,
      report,
      environment,
    );
    await validateAcceptanceInputs(repository, pointer);
    assert.equal(await hashFile(pointer), report.candidate.descriptorSha256);
    const outcomes = {};
    for (const [kind, count] of [
      profile === 'pr' ? ['smoke', 64] : ['matrix', 664],
      ['regressions', 6],
    ]) {
      const result = JSON.parse(
        await fs.readFile(
          path.join(temporary, 'browser', `${kind}-outcomes.json`),
          'utf8',
        ),
      );
      assert.equal(result.status, 'passed');
      assert.equal(result.descriptor, report.candidate.descriptorSha256);
      assert.equal(result.npmMetadata, npm.metadataPath);
      assert.equal(result.expected.length, count);
      assert.equal(result.outcomes.length, count);
      assert.equal(
        new Set(result.outcomes.map((row) => JSON.stringify(row.identity)))
          .size,
        count,
      );
      assert.deepEqual(
        result.outcomes.map((row) => JSON.stringify(row.identity)).sort(),
        result.expected.map((row) => JSON.stringify(row)).sort(),
      );
      assert.ok(
        result.outcomes.every(
          (row) =>
            row.status === 'passed' &&
            row.expectedStatus === 'passed' &&
            row.retry === 0 &&
            row.errors.length === 0,
        ),
      );
      assert.equal(result.diagnostics.length, 0);
      outcomes[kind] = {
        count,
        sha256: await hashFile(
          path.join(temporary, 'browser', `${kind}-outcomes.json`),
        ),
      };
    }
    const docs = (await fs.readdir(candidate.root)).filter((name) =>
      name.startsWith('docs-'),
    );
    assert.equal(docs.length, 1, 'One shared documentation consumer required');
    const docsDirectory = path.join(candidate.root, docs[0]);
    const declared = JSON.parse(
      await fs.readFile(
        path.join(docsDirectory, 'declared-programs.json'),
        'utf8',
      ),
    );
    assert.equal(declared.length, 32);
    for (let index = 0; index < 32; index++) {
      const result = JSON.parse(
        await fs.readFile(
          path.join(docsDirectory, `qualified-${index}.json`),
          'utf8',
        ),
      );
      assert.equal(result.candidateSha256, candidate.sha256);
      assert.equal(result.sourceSha256, declared[index].sourceSha256);
    }
    report.outcomes = outcomes;
    report.documentationPrograms = 32;
    report.guardTiming = {};
    for (const kind of [profile === 'pr' ? 'smoke' : 'matrix', 'regressions']) {
      const rows = (
        await fs.readFile(
          path.join(temporary, 'browser', `${kind}-spawns.jsonl`),
          'utf8',
        )
      )
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      const guards = rows.filter((row) => row.event === 'launch-guard');
      report.guardTiming[kind] = {
        guards: guards.length,
        milliseconds: guards.reduce((total, row) => total + row.guardMs, 0),
        loaded: rows.filter((row) => row.event === 'verified-loaded').length,
      };
    }
    assert.equal(report.packInvocations, imported.publishedArchive ? 0 : 1);
    assert.equal(report.npmPreparations, 1);
    report.status = 'passed';
  } catch (error) {
    failure = error;
    report.failure = failureMessage(error);
  } finally {
    try {
      await exportDiagnostics(temporary, directory, report.exportErrors);
    } catch {
      exportError(report.exportErrors, '.', 'EXPORT_FAILED');
    }
    if (candidate) {
      try {
        await exportCandidate(candidate, directory, report);
      } catch {
        exportError(report.exportErrors, 'candidate', 'EXPORT_FAILED');
      }
    }
    if (report.outcomes)
      for (const kind of Object.keys(report.outcomes)) {
        try {
          report.outcomes[kind].sha256 = await hashFile(
            path.join(directory, 'browser', `${kind}-outcomes.json`),
          );
        } catch {
          exportError(
            report.exportErrors,
            kind + '-outcomes.json',
            'MISSING_ARTIFACT',
          );
        }
      }
    if (failure || report.exportErrors.length) {
      report.status = 'failed';
      report.failure ??= 'Diagnostic export failed';
    }
    try {
      await save();
    } catch (error) {
      failure ??= error;
    }
    console.log(
      JSON.stringify({
        directory,
        privateEvidence: temporary,
        status: report.status,
        candidate: report.candidate,
      }),
    );
  }
  if (failure) throw failure;
  assert.equal(report.status, 'passed', report.failure);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await runAcceptance();
  } catch (error) {
    console.error(failureMessage(error));
    process.exitCode = 1;
  }
}
