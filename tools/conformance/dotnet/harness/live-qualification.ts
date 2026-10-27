import { LIVE_PROJECTS } from './live-configuration';
import { LIVE_BUDGET_MANIFEST } from './live-budget';

/** Fixed-case evidence counts, distinct from the planned matrix size. */
export interface LiveQualificationSnapshot {
  readonly actualPassedCases: number;
  readonly successfulPreflights: number;
  readonly completedFixtures: number;
  readonly invalid: boolean;
}

/** Requires actual wire, usage, cancellation and effect evidence before accepting a native fixture. */
function validEvidence(
  stats: unknown,
  counters: unknown,
  maxCalls: number,
  minimumCalls: number,
  path: string,
  server: number,
  protectedEffects: number,
  cancelled: boolean,
): boolean {
  if (
    !stats ||
    typeof stats !== 'object' ||
    !counters ||
    typeof counters !== 'object'
  )
    return false;
  const input = stats as Record<string, unknown>;
  const effects = counters as Record<string, unknown>;
  const numeric = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  if (
    !numeric(input['calls']) ||
    !numeric(input['httpCalls']) ||
    !numeric(input['cancelledCalls']) ||
    !numeric(input['inputTokens']) ||
    !numeric(input['outputTokens']) ||
    input['stage'] !== 'completed'
  )
    return false;
  const calls = input['calls'] as number;
  const cancelledCalls = input['cancelledCalls'] as number;
  if (
    calls < minimumCalls ||
    calls > maxCalls ||
    input['httpCalls'] !== calls ||
    cancelledCalls > calls ||
    (cancelled ? cancelledCalls < 1 : cancelledCalls !== 0) ||
    effects['server'] !== server ||
    effects['protected'] !== protectedEffects
  )
    return false;
  const wire = input['wire'];
  return (
    Array.isArray(wire) &&
    wire.length === calls &&
    wire.every((fact: unknown) => {
      if (!fact || typeof fact !== 'object') return false;
      const value = fact as Record<string, unknown>;
      return (
        value['method'] === 'POST' &&
        value['path'] === path &&
        ['api-key', 'bearer'].includes(String(value['authentication'])) &&
        numeric(value['maxOutputTokens']) &&
        (value['maxOutputTokens'] as number) > 0 &&
        (value['maxOutputTokens'] as number) <= 384 &&
        value['store'] === false &&
        numeric(value['status']) &&
        (value['status'] as number) >= 200 &&
        (value['status'] as number) < 300
      );
    })
  );
}

/** Tracks only the fixed 42 case identities and three preflights, failing closed on incomplete or repeated evidence. */
export function createLiveQualificationLedger() {
  const outcomes = new Set<string>();
  const fixtures = new Set<string>();
  const preflights = new Set<string>();
  let invalid = false;
  const reject = () => {
    invalid = true;
    return false;
  };
  const snapshot = (): LiveQualificationSnapshot =>
    Object.freeze({
      actualPassedCases: [...outcomes].filter((key) => fixtures.has(key))
        .length,
      successfulPreflights: preflights.size,
      completedFixtures: fixtures.size,
      invalid,
    });
  return Object.freeze({
    fail: reject,
    snapshot,
    recordOutcome: (input: Readonly<Record<string, unknown>>) => {
      const key = `${input['project']}/${input['group']}`;
      if (
        !LIVE_PROJECTS.some((entry) => entry.name === input['project']) ||
        !LIVE_BUDGET_MANIFEST.groups.some(
          (entry) => entry.name === input['group'],
        ) ||
        input['outcome'] !== 'passed' ||
        outcomes.has(key)
      )
        return reject();
      outcomes.add(key);
      return true;
    },
    recordFixture: (
      projectName: string,
      groupName: string,
      stats: unknown,
      counters: unknown,
    ) => {
      const project = LIVE_PROJECTS.find((entry) => entry.name === projectName);
      const group = LIVE_BUDGET_MANIFEST.groups.find(
        (entry) => entry.name === groupName,
      );
      const key = `${projectName}/${groupName}`;
      const minimum = [
        'browser-tool',
        'server-tool',
        'cancellation-recovery',
      ].includes(groupName)
        ? 2
        : 1;
      const path =
        project?.provider === 'openai'
          ? '/v1/responses'
          : '/openai/v1/responses';
      if (
        !project ||
        !group ||
        fixtures.has(key) ||
        !validEvidence(
          stats,
          counters,
          group.calls,
          minimum,
          path,
          groupName === 'server-tool' ? 1 : 0,
          groupName === 'approval-resume-decline' ? 1 : 0,
          groupName === 'cancellation-recovery',
        )
      )
        return reject();
      if (
        project.auth === 'azure-cli' &&
        (stats as { wire: Array<{ authentication: string }> }).wire.some(
          (fact) => fact.authentication !== 'bearer',
        )
      )
        return reject();
      fixtures.add(key);
      return true;
    },
    recordPreflight: (name: string, stats: unknown, counters: unknown) => {
      const path =
        name === 'openai-responses'
          ? '/v1/responses'
          : name === 'azure-responses'
            ? '/openai/v1/responses'
            : '/openai/deployments/gpt-4.1-mini/chat/completions';
      if (
        !LIVE_BUDGET_MANIFEST.preflights.includes(name) ||
        preflights.has(name) ||
        !validEvidence(stats, counters, 1, 1, path, 0, 0, false)
      )
        return reject();
      if (
        name === 'azure-cli-chat' &&
        (stats as { wire: Array<{ authentication: string }> }).wire.some(
          (fact) => fact.authentication !== 'bearer',
        )
      )
        return reject();
      preflights.add(name);
      return true;
    },
    assertComplete: () => {
      const actual = snapshot();
      if (
        actual.invalid ||
        actual.actualPassedCases !== 42 ||
        actual.completedFixtures !== 42 ||
        actual.successfulPreflights !== 3
      )
        throw new Error('LIVE_QUALIFICATION_INCOMPLETE');
    },
  });
}
