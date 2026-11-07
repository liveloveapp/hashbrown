import { mkdtemp, rm } from 'node:fs/promises';
import * as http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser } from '@playwright/test';
import { runDeterministicReleaseRecoveryControls } from '../harness/live-recovery-controls';
import * as selection from '../harness/live-recovery-package';
import * as staticServers from '../harness/live-static-server';

test('failed second static acquisition drains the actual endpoint and first static server', async () => {
  const root = await mkdtemp(join(tmpdir(), 'recovery-control-cleanup-'));
  const servers: http.Server[] = [];
  const actualCreate = http.createServer;
  const actualStatic = staticServers.startLiveStaticServer;
  const create = jest
    .spyOn(http, 'createServer')
    .mockImplementation((...args: Parameters<typeof actualCreate>) => {
      const server = actualCreate(...args);
      servers.push(server);
      return server;
    });
  const qualify = jest
    .spyOn(selection, 'selectReleaseRecoveryPackages')
    .mockResolvedValue({
      request: {
        mode: 'candidate',
        npmMetadata: '/private/npm',
        nugetMetadata: '/private/nuget',
      },
      selection: { HASHBROWN_DOTNET_HOST_MODE: 'package' },
      artifacts: { react: root, angular: root },
      anchor: 'a'.repeat(64),
      assertAnchored: async () => undefined,
      requalify: async () => undefined,
      provenance: {
        kind: 'source-candidate',
        npmVersion: '0.9.0',
        nugetVersion: '0.1.0-preview.2',
        npmPointerSha256: 'a'.repeat(64),
        nugetPointerSha256: 'b'.repeat(64),
        packagePointerSha256: 'c'.repeat(64),
        loadedIdentity: 'control',
        loadedSha256: 'd'.repeat(64),
        npmProducerRevision: 'e'.repeat(40),
        nugetProducerRevision: 'f'.repeat(40),
        closureSha256: 'a'.repeat(64),
      },
    });
  let starts = 0;
  const start = jest
    .spyOn(staticServers, 'startLiveStaticServer')
    .mockImplementation(async (directory) => {
      starts++;
      if (starts === 2) throw new Error('CONTROL_STATIC_ACQUISITION_FAILURE');
      return actualStatic(directory);
    });

  try {
    await expect(
      runDeterministicReleaseRecoveryControls({} as Browser, {
        HASHBROWN_CANDIDATE_NPM_METADATA: '/private/npm',
        HASHBROWN_CANDIDATE_NUGET_METADATA: '/private/nuget',
        DOTNET_TEST_POSTGRES: 'control-unused',
      }),
    ).rejects.toThrow('CONTROL_STATIC_ACQUISITION_FAILURE');

    expect(servers).toHaveLength(2);
    expect(servers.every((server) => !server.listening)).toBe(true);
  } finally {
    start.mockRestore();
    qualify.mockRestore();
    create.mockRestore();
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
    await rm(root, { recursive: true, force: true });
  }
});
