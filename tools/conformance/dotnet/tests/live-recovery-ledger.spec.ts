import { createReleaseRecoveryLedger } from '../harness/live-recovery-evidence';
import {
  RELEASE_RECOVERY_MANIFEST,
  releaseRecoveryCases,
} from '../harness/live-recovery-manifest';

test('requires every exact recovery case and three separately reserved preflights', () => {
  const ledger = createReleaseRecoveryLedger();
  for (const record of releaseRecoveryCases().slice(0, -1))
    ledger.case(record.id);
  for (const preflight of RELEASE_RECOVERY_MANIFEST.preflights)
    ledger.preflight(preflight);

  expect(() => ledger.assertComplete()).toThrow(
    'RECOVERY_QUALIFICATION_INCOMPLETE',
  );
  ledger.case(releaseRecoveryCases().at(-1)!.id);

  expect(() => ledger.assertComplete()).not.toThrow();
});

test('duplicate, foreign and repeated preflight evidence permanently invalidate qualification', () => {
  for (const action of [
    (ledger: ReturnType<typeof createReleaseRecoveryLedger>) => {
      ledger.case('react-openai-key/cold-restore');
      ledger.case('react-openai-key/cold-restore');
    },
    (ledger: ReturnType<typeof createReleaseRecoveryLedger>) => {
      ledger.case('react-openai-key/native-approval');
    },
    (ledger: ReturnType<typeof createReleaseRecoveryLedger>) => {
      ledger.preflight('azure-cli-chat');
      ledger.preflight('azure-cli-chat');
    },
    (ledger: ReturnType<typeof createReleaseRecoveryLedger>) => {
      ledger.preflight('new-unreserved-preflight');
    },
  ]) {
    const ledger = createReleaseRecoveryLedger();

    expect(() => action(ledger)).toThrow('RECOVERY_LEDGER_INVALID');
    expect(ledger.snapshot().invalid).toBe(true);
    expect(() => ledger.assertComplete()).toThrow(
      'RECOVERY_QUALIFICATION_INCOMPLETE',
    );
  }
});
