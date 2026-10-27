import type {
  FullResult,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import LiveReporter from '../harness/live-reporter';
import { createLiveDiagnostics } from '../harness/live-diagnostics';

/** Supplies controlled project/group identifiers without any provider execution. */
function reporterCase(group = 'native-approval'): TestCase {
  return {
    title: group,
    annotations: [],
    parent: { project: () => ({ name: 'react-openai-key' }) },
  } as unknown as TestCase;
}

/** Supplies only controlled reporter status/annotation data, with unsafe extras to exercise projection. */
function reporterResult(status: string, annotations: unknown[]): TestResult {
  return {
    status,
    duration: 1,
    annotations,
    errors: [new Error('PHASE_CANARY_PRIVATE')],
    stdout: ['PHASE_CANARY_PRIVATE'],
  } as unknown as TestResult;
}

test('reporter persists only the last valid group-specific failed phase without raw data', async () => {
  const records: Readonly<Record<string, unknown>>[] = [];
  const reporter = new LiveReporter({
    postOutcome: async (record) => {
      records.push(record);
    },
  });

  reporter.onTestEnd(
    reporterCase(),
    reporterResult('failed', [
      { type: 'live-phase', description: 'native-pending' },
      { type: 'untrusted-note', description: 'PHASE_CANARY_PRIVATE' },
      { type: 'live-phase', description: 'native-followup' },
    ]),
  );
  await reporter.onEnd({ status: 'failed' } as FullResult);

  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    outcome: 'failed',
    failureCode: 'LIVE_ASSERTION_FAILED',
    failurePhase: 'native-followup',
  });
  expect(JSON.stringify(records)).not.toContain('PHASE_CANARY_PRIVATE');
});

for (const phase of [
  'PHASE_CANARY_PRIVATE',
  'mixed-before-pending-save',
  123,
  { toString: () => 'native-pending' },
])
  test(`unknown or cross-group reporter phase fails closed: ${typeof phase === 'string' ? phase : typeof phase}`, async () => {
    const records: Readonly<Record<string, unknown>>[] = [];
    const reporter = new LiveReporter({
      postOutcome: async (record) => {
        records.push(record);
      },
    });

    reporter.onTestEnd(
      reporterCase(),
      reporterResult('passed', [{ type: 'live-phase', description: phase }]),
    );
    const terminal = await reporter.onEnd({ status: 'passed' } as FullResult);

    expect(terminal).toEqual({ status: 'failed' });
    expect(records).toEqual([]);
  });

test('successful outcomes never persist a valid phase annotation', async () => {
  const records: Readonly<Record<string, unknown>>[] = [];
  const reporter = new LiveReporter({
    postOutcome: async (record) => {
      records.push(record);
    },
  });

  reporter.onTestEnd(
    reporterCase(),
    reporterResult('passed', [
      { type: 'live-phase', description: 'native-followup' },
    ]),
  );
  await reporter.onEnd({ status: 'passed' } as FullResult);

  expect(records[0]).not.toHaveProperty('failurePhase');
});

test('diagnostics persists the fixed failed phase only for its allowed group', () => {
  const writes: string[] = [];
  const diagnostics = createLiveDiagnostics({
    write: (line) => writes.push(line),
  });

  const recorded = diagnostics.record({
    project: 'react-openai-key',
    group: 'mixed-native-tools',
    outcome: 'failed',
    failurePhase: 'mixed-before-pending-save',
    error: new Error('PHASE_CANARY_PRIVATE'),
  });

  expect(recorded).toBe(true);
  expect(JSON.parse(writes[0])).toMatchObject({
    failurePhase: 'mixed-before-pending-save',
  });
  expect(writes.join('')).not.toContain('PHASE_CANARY_PRIVATE');
});

for (const extra of [
  { failurePhase: 'PHASE_CANARY_PRIVATE' },
  { failurePhase: 'mixed-before-pending-save' },
  { failurePhase: 'native-pending', outcome: 'passed' },
  { failurePhase: { value: 'PHASE_CANARY_PRIVATE' } },
])
  test(`diagnostics rejects invalid failure phase metadata without persistence: ${JSON.stringify(extra)}`, () => {
    const writes: string[] = [];
    const diagnostics = createLiveDiagnostics({
      write: (line) => writes.push(line),
    });

    const recorded = diagnostics.record({
      project: 'react-openai-key',
      group: 'native-approval',
      outcome: 'failed',
      ...extra,
    });

    expect(recorded).toBe(false);
    expect(writes).toEqual([]);
    expect(() => diagnostics.assertHealthy()).toThrow(
      'LIVE_DIAGNOSTICS_FAILED',
    );
  });
