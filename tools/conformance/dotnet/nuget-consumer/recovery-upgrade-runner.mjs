import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { hashFile, verifyConsumer } from './verify.mjs';
import {
  preparePublishedRecoveryBaseline,
  verifyPublishedRecoveryBaseline,
} from './published-recovery-baseline.mjs';
import { sanitize } from './run.mjs';

const launch = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../../../..');
const names = [
  'historical-upgrade',
  'published-recovery-baseline',
  'recovery-compatibility',
];

/** Runs every mandatory upgrade substep sequentially and retains a bounded failed receipt on any error. */
export async function runRecoveryUpgrade(
  args = process.argv.slice(2),
  options = {},
) {
  assert.ok(
    args.length === 2 && args[0] === '--metadata' && path.isAbsolute(args[1]),
    'Explicit candidate --metadata required',
  );
  const pointer = args[1];
  const directory =
    options.evidenceDirectory ??
    process.env.HASHBROWN_UPGRADE_EVIDENCE_DIRECTORY ??
    (await fs.mkdtemp(path.join(os.tmpdir(), 'hashbrown-recovery-upgrade-')));
  assert.ok(
    path.isAbsolute(directory),
    'Absolute private upgrade evidence required',
  );
  await fs.mkdir(directory, { recursive: true });
  const report = { status: 'failed', candidate: pointer, steps: [] };
  let baseline;
  let candidateHash;
  async function child(
    name,
    command,
    values,
    environment = process.env,
    timeout = 600_000,
  ) {
    try {
      const result = await launch(command, values, {
        cwd: repository,
        env: environment,
        timeout,
        maxBuffer: 16 * 1024 * 1024,
      });
      await fs.writeFile(
        path.join(directory, `${name}.log`),
        sanitize(result.stdout + result.stderr),
      );
      return result;
    } catch (error) {
      await fs.writeFile(
        path.join(directory, `${name}.log`),
        sanitize(
          `${error.stdout ?? ''}\n${error.stderr ?? ''}\n${error.message}`,
        ),
      );
      throw error;
    }
  }
  const execute =
    options.execute ??
    (async ({ name }) => {
      if (name === 'historical-upgrade') {
        candidateHash = await hashFile(pointer);
        await child(
          name,
          process.execPath,
          [path.join(here, 'upgrade-runner.mjs'), ...args],
          { ...process.env, HASHBROWN_UPGRADE_EVIDENCE_DIRECTORY: directory },
        );
      } else if (name === 'published-recovery-baseline') {
        baseline = await preparePublishedRecoveryBaseline(
          path.join(directory, 'published-recovery-baseline'),
        );
      } else {
        assert.ok(
          baseline,
          'Qualified published baseline required before compatibility',
        );
        const outcomes = path.join(directory, 'recovery-outcomes.jsonl');
        await child(
          name,
          'npx',
          [
            'nx',
            'test-recovery-compatibility',
            'dotnet-conformance',
            '--skipNxCache',
            '--output-style=static',
          ],
          {
            ...process.env,
            HASHBROWN_DOTNET_HOST_MODE: 'source',
            HASHBROWN_BROWSER_PUBLISHED_METADATA: baseline.nuget,
            HASHBROWN_BROWSER_PUBLISHED_NPM_METADATA: baseline.npm,
            HASHBROWN_BROWSER_COMPATIBILITY_EVIDENCE: outcomes,
            HASHBROWN_PACKAGE_SPAWN_REPORT: path.join(
              directory,
              'recovery-spawns.jsonl',
            ),
          },
          600_000,
        );
        const rows = (await fs.readFile(outcomes, 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
        assert.equal(
          rows.length,
          4,
          'All four old-server compatibility cases required',
        );
        assert.equal(
          new Set(rows.map((row) => `${row.mixed}/${row.known}`)).size,
          4,
          'Complete browser/mixed known/unavailable matrix required',
        );
        for (const row of rows) {
          assert.equal(typeof row.mixed, 'boolean');
          assert.equal(typeof row.known, 'boolean');
          assert.deepEqual(row.statuses, [400, 400, 400, 400]);
          assert.deepEqual(row.requests, []);
          assert.deepEqual(row.after, row.before);
          assert.equal(row.legacy.schemaVersion, 1);
          assert.equal(row.beforeBaseline.nugetPointer, baseline.nugetSha256);
          assert.equal(row.beforeBaseline.npmPointer, baseline.npmSha256);
          assert.equal(
            row.beforeBaseline.loaded.sha256,
            baseline.loaded.sha256,
          );
        }
        await verifyConsumer(
          JSON.parse(await fs.readFile(baseline.nuget, 'utf8')),
        );
        await child('published-post-qualification', process.execPath, [
          path.join(
            baseline.producer,
            'tools/conformance/dotnet/nuget-consumer/qualify.mjs',
          ),
          '--metadata',
          baseline.nuget,
        ]);
        await child('npm-post-qualification', process.execPath, [
          path.join(
            baseline.producer,
            'tools/conformance/dotnet/live-consumer/qualify.mjs',
          ),
          baseline.npm,
        ]);
        await verifyPublishedRecoveryBaseline(
          path.join(
            repository,
            'tools/conformance/dotnet/published-baselines/0.1.0-preview.1',
          ),
        );
        assert.equal(await hashFile(baseline.nuget), baseline.nugetSha256);
        assert.equal(await hashFile(baseline.npm), baseline.npmSha256);
        assert.equal(
          await hashFile(pointer),
          candidateHash,
          'Candidate pointer changed during compatibility',
        );
        const originalUpgrade = JSON.parse(
          await fs.readFile(path.join(directory, 'qualification.json'), 'utf8'),
        );
        assert.equal(
          originalUpgrade.status,
          0,
          'Historical upgrade qualification must remain successful',
        );
        await fs.writeFile(
          path.join(directory, 'recovery-compatibility.json'),
          JSON.stringify(
            sanitize({
              status: 0,
              cases: 4,
              rejectedSubmissions: 16,
              nugetPointerSha256: baseline.nugetSha256,
              npmPointerSha256: baseline.npmSha256,
              loaded: baseline.loaded,
            }),
            null,
            2,
          ),
        );
      }
    });
  try {
    for (const name of names) {
      const step = { name, status: 'running' };
      report.steps.push(step);
      await fs.writeFile(
        path.join(directory, 'recovery-substeps.json'),
        JSON.stringify(report, null, 2),
      );
      try {
        await execute({ name });
        step.status = 'passed';
      } catch (error) {
        step.status = 'failed';
        throw error;
      }
    }
    report.status = 'passed';
    return report;
  } finally {
    await fs.writeFile(
      path.join(directory, 'recovery-substeps.json'),
      JSON.stringify(sanitize(report), null, 2),
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(JSON.stringify(await runRecoveryUpgrade()));
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  }
}
