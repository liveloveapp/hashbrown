import { expect, test } from '@playwright/test';
import { chmod, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { selectReleaseRecoveryPackages } from '../harness/live-recovery-package';
import { executeReleaseRecoveryRunner } from '../harness/live-recovery-runner';

function inputs() {
  const npmMetadata = process.env['HASHBROWN_CANDIDATE_NPM_METADATA'];
  const nugetMetadata = process.env['HASHBROWN_CANDIDATE_NUGET_METADATA'];
  if (!npmMetadata || !nugetMetadata)
    throw new Error(
      'Explicit fresh candidate package pointers required for physical selection controls',
    );
  return { mode: 'candidate' as const, npmMetadata, nugetMetadata };
}
async function json(file: string) {
  return JSON.parse(await readFile(file, 'utf8'));
}

// These controls deliberately tamper only explicit fresh owned candidate artifacts and restore their exact bytes/mode.
test('the new release selector accepts the actual current candidate pair and requalifies its anchored bytes', async () => {
  const selected = await selectReleaseRecoveryPackages(inputs());

  expect(selected.provenance.kind).toBe('source-candidate');
  expect(selected.provenance.npmVersion).toBe('0.9.0');
  expect(selected.provenance.nugetVersion).toBe('0.1.0-preview.2');
  expect(selected.selection.HASHBROWN_DOTNET_HOST_MODE).toBe('package');
  expect(selected.provenance.loadedSha256).toMatch(/^[a-f0-9]{64}$/);
  await selected.requalify();
});

test('actual pointer/archive/installed/module/DLL/role/runtime tampering is rejected before credential loading', async () => {
  const request = inputs();
  const selected = await selectReleaseRecoveryPackages(request);
  const npm = await json((await json(request.npmMetadata)).metadata);
  const binding = await json((await json(request.nugetMetadata)).metadata);
  const raw = await json(binding.packagePointer);
  const nuget = await json(raw.metadata);
  const fixture = nuget.roles.fixture;
  const targets = [
    request.npmMetadata,
    (await json(request.npmMetadata)).metadata,
    npm.archives['@hashbrownai/core'].archive,
    join(npm.root, 'node_modules/@hashbrownai/core/package.json'),
    join(npm.root, 'react-module-ids.json'),
    binding.packagePointer,
    join(nuget.root, nuget.archive),
    join(nuget.root, fixture.library),
    join(nuget.root, fixture.directory, 'Program.cs'),
    join(
      nuget.root,
      fixture.executable.replace(/\.dll$/, '.runtimeconfig.json'),
    ),
  ];
  const ownedRoots = await Promise.all(
    [
      tmpdir(),
      dirname(request.npmMetadata),
      dirname(request.nugetMetadata),
    ].map((root) => realpath(root)),
  );
  let credentialReads = 0;
  let executions = 0;

  for (const file of targets) {
    expect(
      ownedRoots.some((root) => {
        const child = relative(root, file);
        return (
          child !== '' &&
          child !== '..' &&
          !child.startsWith('..' + sep) &&
          !isAbsolute(child)
        );
      }),
    ).toBe(true);
    const original = await readFile(file);
    const mode = (await stat(file)).mode;
    await chmod(file, 0o600);
    await writeFile(file, Buffer.concat([original, Buffer.from(' ')]));
    try {
      await expect(
        executeReleaseRecoveryRunner(
          [
            '--mode',
            'candidate',
            '--npm-metadata',
            request.npmMetadata,
            '--nuget-metadata',
            request.nugetMetadata,
            '--credentials',
            '/private/not-read.env',
          ],
          { HASHBROWN_DOTNET_LIVE: '1' },
          {
            loadConfiguration: async () => {
              credentialReads++;
              throw new Error('credentials must remain unread');
            },
            execute: async () => {
              executions++;
              throw new Error('execution must remain unstarted');
            },
          },
        ),
      ).rejects.toThrow('RECOVERY_SELECTION_INVALID');
      await expect(selected.requalify()).rejects.toThrow();
    } finally {
      await writeFile(file, original);
      await chmod(file, mode);
    }
  }

  expect(credentialReads).toBe(0);
  expect(executions).toBe(0);
  await selected.requalify();
});

test('actual candidate receipts cannot be relabeled as future exact public releases', async () => {
  const request = inputs();
  await selectReleaseRecoveryPackages(request);

  await expect(
    selectReleaseRecoveryPackages({ ...request, mode: 'public' }),
  ).rejects.toThrow('RECOVERY_SELECTION_INVALID');
});
