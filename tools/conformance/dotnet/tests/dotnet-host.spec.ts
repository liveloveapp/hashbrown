import { createHash } from 'node:crypto';
import { ownedDescriptor } from './fixtures/owned-package-host';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withDotnetFixture } from '../harness/http-fixture';

jest.mock('@copilotkit/aimock', () => ({
  LLMock: jest.fn().mockImplementation(() => ({
    onMessage: jest.fn(),
    start: jest.fn().mockRejectedValue(new Error('POISON_MODEL_STARTED')),
  })),
}));

for (const state of [
  'missing',
  'corrupt',
  'lost-on-restart',
  'lost-on-second-worker',
])
  test(`package host rejects ${state} descriptor before acquiring model or spawning dist`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'hashbrown-host-test-'));
    const metadata = join(directory, 'candidate.json');
    if (state === 'corrupt') writeFileSync(metadata, '{broken');
    const original = { ...process.env };
    process.env['HASHBROWN_DOTNET_HOST_MODE'] = 'package';
    process.env['HASHBROWN_DOTNET_CONSUMER_METADATA'] = metadata;
    process.env['HASHBROWN_DOTNET_CONSUMER_SHA256'] = 'a'.repeat(64);

    try {
      await expect(
        withDotnetFixture('openai', async () => undefined),
      ).rejects.toThrow(/descriptor|ENOENT|anchor|JSON/i);
    } finally {
      process.env = original;
      rmSync(directory, { recursive: true, force: true });
    }
  });

import { unlinkSync } from 'node:fs';
import {
  fixtureChildEnvironment,
  resolveDotnetHost,
  validateHostOverrides,
  verifyLoadedDotnetHost,
} from '../harness/dotnet-host';

for (const mutation of [
  'dll',
  'source',
  'restart-descriptor-loss',
  'second-worker-descriptor-loss',
])
  test(`fresh launch guard rejects ${mutation} after prior qualification without touching dist`, () => {
    const owned = ownedDescriptor();
    const host = resolveDotnetHost(owned.selection);
    if (mutation === 'dll')
      writeFileSync(
        join(
          owned.root,
          'roles/fixture/bin/Release/net10.0/Hashbrown.AspNetCore.dll',
        ),
        'replaced',
      );
    else if (mutation === 'source')
      writeFileSync(join(owned.root, 'Program.cs'), 'replaced');
    else unlinkSync(owned.selection.HASHBROWN_DOTNET_CONSUMER_METADATA);

    try {
      expect(host.executable.startsWith(owned.root)).toBe(true);
      expect(host.workingDirectory).toBe(
        join(owned.root, 'roles/fixture/bin/Release/net10.0'),
      );
      expect(() => resolveDotnetHost(owned.selection)).toThrow(
        /hash changed|ENOENT/,
      );
    } finally {
      rmSync(owned.root, { recursive: true, force: true });
    }
  });

test('requires actual loaded package identity before readiness', () => {
  const owned = ownedDescriptor();
  const host = resolveDotnetHost(owned.selection);

  try {
    expect(() =>
      verifyLoadedDotnetHost(host, 'Now listening on: http://127.0.0.1:1234'),
    ).toThrow(/loaded/);
    expect(() =>
      verifyLoadedDotnetHost(
        host,
        'HASHBROWN_PACKAGE_IDENTITY:' +
          JSON.stringify({ ...host.loaded, sha256: 'wrong' }),
      ),
    ).toThrow(/loaded/);
    expect(() =>
      verifyLoadedDotnetHost(
        host,
        'HASHBROWN_PACKAGE_IDENTITY:' + JSON.stringify(host.loaded),
      ),
    ).not.toThrow();
  } finally {
    rmSync(owned.root, { recursive: true, force: true });
  }
});

for (const key of [
  'DOTNET_STARTUP_HOOKS',
  'ASPNETCORE_HOSTINGSTARTUPASSEMBLIES',
  'ASPNETCORE_CONTENTROOT',
  'RestoreSources',
])
  test(`rejects ${key} application environment injection`, () => {
    const environment = { [key]: '/poison/source-or-loader' };

    expect(() => validateHostOverrides(environment)).toThrow(/injection/);
  });

test('rejects an added discovered appsettings file before a second launch', () => {
  const owned = ownedDescriptor();
  resolveDotnetHost(owned.selection);
  writeFileSync(
    join(owned.root, 'roles/fixture/bin/Release/net10.0/appsettings.json'),
    '{"ModelEndpoint":"http://poison"}',
  );

  try {
    expect(() => resolveDotnetHost(owned.selection)).toThrow(
      /file closure changed/,
    );
  } finally {
    rmSync(owned.root, { recursive: true, force: true });
  }
});

test('constructs package child environment from pinned basics and reviewed case-insensitive fixture values only', () => {
  const owned = ownedDescriptor();
  const host = resolveDotnetHost(owned.selection);

  try {
    const child = fixtureChildEnvironment(host, {
      ModelApi: 'responses',
      Workflow: 'confirm',
    });

    expect(child).toEqual({
      HASHBROWN_DOTNET_PACKAGE_IDENTITY: 'true',
      ModelApi: 'responses',
      Workflow: 'confirm',
    });
    for (const key of [
      'dotnet_startup_hooks',
      'DotNet_Additional_Deps',
      'ASPNETCORE_HOSTINGSTARTUPASSEMBLIES',
      'CORECLR_PROFILER',
      'COMPlus_EnableDiagnostics',
      'arbitrary',
    ])
      expect(() => validateHostOverrides({ [key]: 'poison' })).toThrow(
        /injection/,
      );
  } finally {
    rmSync(owned.root, { recursive: true, force: true });
  }
});

for (const mutation of [
  'missing-launcher',
  'foreign-launcher',
  'missing-runtime-evidence',
  'empty-runtime-evidence',
  'missing-runtime-trees',
  'empty-evaluated-inputs',
  'unmanifested-dist-executable',
  'wrong-role-library',
  'empty-source-trees',
  'missing-source-trees',
  'missing-probe-role',
  'missing-roles',
  'extra-role',
  'missing-evaluation',
])
  test(`rejects independently resealed ${mutation} before model acquisition`, async () => {
    const owned = ownedDescriptor();
    resolveDotnetHost(owned.selection);
    const metadata = JSON.parse(
      readFileSync(join(owned.root, 'metadata.json'), 'utf8'),
    );
    const role: Record<string, unknown> = metadata.roles.fixture;
    if (mutation === 'missing-launcher') delete role.launcher;
    if (mutation === 'foreign-launcher')
      role.launcher = join(owned.root, 'poison-launcher');
    if (mutation === 'missing-runtime-evidence') {
      delete role.runtimeInputs;
      delete role.runtimeTrees;
    }
    if (mutation === 'empty-runtime-evidence') {
      role.runtimeInputs = {};
      role.runtimeTrees = [];
    }
    if (mutation === 'missing-runtime-trees') delete role.runtimeTrees;
    if (mutation === 'empty-evaluated-inputs') role.inputs = {};
    if (mutation === 'unmanifested-dist-executable')
      role.executable =
        'dist/tools/conformance/dotnet/Hashbrown.Conformance.dll';
    if (mutation === 'wrong-role-library')
      role.library = 'roles/probe/bin/Release/net10.0/Hashbrown.AspNetCore.dll';
    if (mutation === 'empty-source-trees') metadata.sourceTrees = [];
    if (mutation === 'missing-source-trees') delete metadata.sourceTrees;
    if (mutation === 'missing-probe-role') delete metadata.roles.probe;
    if (mutation === 'missing-roles') delete metadata.roles;
    if (mutation === 'extra-role')
      metadata.roles.unreviewed = metadata.roles.fixture;
    if (mutation === 'missing-evaluation') delete role.evaluation;
    const digest = (text: string) =>
      createHash('sha256').update(text).digest('hex');
    const bytes = JSON.stringify(metadata);
    writeFileSync(join(owned.root, 'metadata.json'), bytes);
    const pointer = JSON.stringify({
      metadata: join(owned.root, 'metadata.json'),
      sha256: digest(bytes),
    });
    writeFileSync(owned.selection.HASHBROWN_DOTNET_CONSUMER_METADATA, pointer);
    writeFileSync(
      owned.selection.HASHBROWN_DOTNET_CONSUMER_METADATA + '.sha256',
      digest(pointer),
    );
    const selection = {
      ...owned.selection,
      HASHBROWN_DOTNET_CONSUMER_SHA256: digest(pointer),
    };
    const environment = { ...process.env };
    process.env['HASHBROWN_PACKAGE_REACT_URL'] = 'http://127.0.0.1:4432';
    process.env['HASHBROWN_PACKAGE_ANGULAR_URL'] = 'http://127.0.0.1:4431';

    try {
      await expect(
        withDotnetFixture(
          'openai',
          async () => undefined,
          '',
          undefined,
          {},
          undefined,
          selection,
        ),
      ).rejects.toThrow(/Package role schema/i);
    } finally {
      process.env = environment;
      rmSync(owned.root, { recursive: true, force: true });
    }
  });
