import { rm } from 'node:fs/promises';
import { startLiveRecoveryWorker } from '../harness/live-recovery-fixture';
import { ownedDescriptor } from './fixtures/owned-package-host';
import { packageLiveWorker } from './fixtures/package-live-worker';

test('an actual owned process crashing after readiness cannot be certified as drained by stop', async () => {
  const descriptor = ownedDescriptor(
    packageLiveWorker + '\nsetTimeout(() => process.exit(7), 500);\n',
  );
  const worker = await startLiveRecoveryWorker({
    selection: descriptor.selection,
    provider: {},
    schema: 'durable_live_' + 'a'.repeat(32),
    origins: [],
    phase: 'preflight',
    remainingMs: 60_000,
    signal: AbortSignal.timeout(5000),
  });

  try {
    await new Promise<void>((done) => setTimeout(done, 700));

    await expect(worker.stop()).rejects.toThrow('RECOVERY_WORKER_FAILED');
  } finally {
    await worker.stop().catch(() => undefined);
    await rm(descriptor.root, { recursive: true, force: true });
  }
});
