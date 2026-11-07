import { LIVE_PROJECTS } from './live-configuration';

/** One immutable release-recovery case, distinct from the retained historical profile. */
export interface ReleaseRecoveryCase {
  readonly id: string;
  readonly project: string;
  readonly group: 'cold-restore' | 'result-reconciliation';
}

/** Fixed reservations and execution limits; unused allowances cannot be transferred. */
export const RELEASE_RECOVERY_MANIFEST = Object.freeze({
  groups: Object.freeze([
    Object.freeze({ name: 'cold-restore' as const, calls: 3 }),
    Object.freeze({ name: 'result-reconciliation' as const, calls: 3 }),
  ]),
  preflights: Object.freeze([
    'openai-responses',
    'azure-responses',
    'azure-cli-chat',
  ]),
  reservedCalls: 39,
  maxRunCalls: 39,
  maxScenarioCalls: 3,
  workerCalls: Object.freeze({ original: 1, replacement: 2 }),
  maxOutputTokens: 384,
  scenarioTimeoutMs: 60_000,
  runTimeoutMs: 900_000,
  workers: 1,
  retries: 0,
});

const cases = Object.freeze(
  LIVE_PROJECTS.flatMap((project) =>
    RELEASE_RECOVERY_MANIFEST.groups.map((group) =>
      Object.freeze({
        id: `${project.name}/${group.name}`,
        project: project.name,
        group: group.name,
      }),
    ),
  ),
);

/** Returns exact expected identities without accessing packages, credentials or services. */
export function releaseRecoveryCases(): readonly ReleaseRecoveryCase[] {
  return cases;
}
