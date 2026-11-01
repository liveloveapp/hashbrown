import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const original = resolve(
  'tools/conformance/dotnet/published-baselines/0.1.0-preview.1',
);
const verifier = pathToFileURL(
  resolve(
    'tools/conformance/dotnet/nuget-consumer/published-recovery-baseline.mjs',
  ),
).href;
const wrapper = pathToFileURL(
  resolve(
    'tools/conformance/dotnet/nuget-consumer/recovery-upgrade-runner.mjs',
  ),
).href;

/** Executes only the local immutable archive guard; it cannot prepare consumers or access a registry. */
async function verify(directory: string) {
  return execute(process.execPath, [
    '--input-type=module',
    '-e',
    `import {verifyPublishedRecoveryBaseline} from ${JSON.stringify(verifier)}; await verifyPublishedRecoveryBaseline(process.argv[1]); console.log('qualified-originals');`,
    directory,
  ]);
}

test('original published compatibility archive pair qualifies with exact hashes and inventory', async () => {
  const result = await verify(original);

  expect(result.stdout).toContain('qualified-originals');
});

for (const mutation of [
  'corrupt-archive',
  'wrong-symbols',
  'missing-symbols',
  'changed-pin',
  'changed-producer',
] as const)
  test(`published compatibility refuses ${mutation} before preparation`, async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'hashbrown-published-negative-'),
    );
    await cp(original, directory, { recursive: true });
    const packageFile = join(
      directory,
      'Hashbrown.AspNetCore.0.1.0-preview.1.nupkg',
    );
    const symbols = packageFile.replace(/\.nupkg$/, '.snupkg');
    if (mutation === 'corrupt-archive') {
      const bytes = await readFile(packageFile);
      bytes[bytes.length - 1] ^= 1;
      await writeFile(packageFile, bytes);
    }
    if (mutation === 'wrong-symbols')
      await writeFile(symbols, await readFile(packageFile));
    if (mutation === 'missing-symbols') await rm(symbols);
    if (mutation === 'changed-pin' || mutation === 'changed-producer') {
      const path = join(directory, 'provenance.json');
      const provenance = JSON.parse(await readFile(path, 'utf8'));
      if (mutation === 'changed-pin')
        provenance.signedPublicArchiveSha256 = '0'.repeat(64);
      else provenance.producerRevision = '0'.repeat(40);
      await writeFile(path, JSON.stringify(provenance));
    }

    try {
      await expect(verify(directory)).rejects.toThrow(
        'PUBLISHED_BASELINE_INTEGRITY',
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

test('published baseline preparation failure retains a failed receipt and prevents compatibility execution', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hashbrown-upgrade-failure-'));
  const script = `import {runRecoveryUpgrade} from ${JSON.stringify(wrapper)};
const steps=[];
try { await runRecoveryUpgrade(['--metadata','/owned/candidate.json'], {execute: async (step) => { steps.push(step.name); if(step.name==='published-recovery-baseline') throw Error('fixture baseline failure'); }, evidenceDirectory:process.argv[1]}); throw Error('unexpected success'); }
catch(error) { if(error.message!=='fixture baseline failure') throw error; }
console.log(JSON.stringify(steps));`;

  try {
    const result = await execute(process.execPath, [
      '--input-type=module',
      '-e',
      script,
      directory,
    ]);
    const receipt = JSON.parse(
      await readFile(join(directory, 'recovery-substeps.json'), 'utf8'),
    );

    expect(JSON.parse(result.stdout.trim())).toEqual([
      'historical-upgrade',
      'published-recovery-baseline',
    ]);
    expect(receipt).toMatchObject({
      status: 'failed',
      steps: [
        { name: 'historical-upgrade', status: 'passed' },
        { name: 'published-recovery-baseline', status: 'failed' },
      ],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('candidate role source closure includes the actual recovery control referenced by Program', async () => {
  const roles = pathToFileURL(
    resolve('tools/conformance/dotnet/nuget-consumer/roles.mjs'),
  ).href;
  const result = await execute(process.execPath, [
    '--input-type=module',
    '-e',
    `import {TESTING} from ${JSON.stringify(roles)}; console.log(JSON.stringify(TESTING));`,
  ]);

  expect(JSON.parse(result.stdout.trim())).toContain(
    'FixtureNativeRecoveryControls.cs',
  );
});
