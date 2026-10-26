import { withDurableCluster } from '../harness/durable-fixture';

async function scenario(name: string) {
  return withDurableCluster('openai', async (cluster) => {
    const fixture = await cluster.start();

    const response = await fetch(`${fixture.url}/__test/retention/${name}`, {
      method: 'POST',
    });
    expect(response.status).toBe(200);
    const result = await response.json();

    expect(fixture.requests).toHaveLength(0);
    return result;
  });
}

test('idle maintenance independently commits bounded metadata, transcript, and audit passes', async () => {
  const result = await scenario('bounded');

  expect(result.first).toEqual({
    metadataRemoved: 2,
    transcriptsPurged: 2,
    auditsRemoved: 2,
  });
  expect(result.second).toEqual({
    metadataRemoved: 2,
    transcriptsPurged: 2,
    auditsRemoved: 2,
  });
  expect(result.third).toEqual({
    metadataRemoved: 1,
    transcriptsPurged: 1,
    auditsRemoved: 1,
  });
  expect(result.fourth).toEqual({
    metadataRemoved: 0,
    transcriptsPurged: 0,
    auditsRemoved: 0,
  });
  expect(result.replay).toBe(410);
  expect(result.retained).toBe(5);
  expect(result.transcripts).toBe(0);
  expect(result.audits).toBe(0);
});

test('independent transcript deadlines preserve admitted leases and unresolved failed effects', async () => {
  const result = await scenario('independent');

  expect(result.cleanup).toEqual({
    metadataRemoved: 1,
    transcriptsPurged: 2,
    auditsRemoved: 0,
  });
  expect(result.retained).toBe(3);
  expect(result.snapshots).toBe(1);
  expect(result.audits).toBe(1);
  expect(result.replay).toBe(410);
});

test('maintenance skips locked candidates and rechecks committed claim state on a later pass', async () => {
  const result = await scenario('locked');

  expect(result.first.metadataRemoved).toBe(1);
  expect(result.second.metadataRemoved).toBe(0);
  expect(result.retained).toBe(1);
});

test('cancellation during transcript lock waits rolls back earlier metadata deletion and permits retry', async () => {
  const result = await scenario('cancel');

  expect(result.cancelled).toBe(true);
  expect(result.rollbackRows).toBe(2);
  expect(result.retry).toEqual({
    metadataRemoved: 1,
    transcriptsPurged: 1,
    auditsRemoved: 0,
  });
});

test('independent cleanup commits even when capacity rejection rolls admission cleanup back', async () => {
  const result = await scenario('capacity');

  expect(result.rejected).toBe(true);
  expect(result.afterRejection).toBe(2);
  expect(result.cleanup).toEqual({
    metadataRemoved: 1,
    transcriptsPurged: 1,
    auditsRemoved: 0,
  });
  expect(result.remaining).toBe(1);
});

test('only explicit reconciliation makes an ambiguous effect eligible for terminal retention', async () => {
  const result = await scenario('reconciled');

  expect(result.before.metadataRemoved).toBe(0);
  expect(result.reconciled).toBe(200);
  expect(result.immediate.metadataRemoved).toBe(0);
  expect(result.expired.metadataRemoved).toBe(1);
  expect(result.auditRetained).toBe(1);
});

test('late capture cannot reintroduce private transcript bytes after the creation deadline', async () => {
  const result = await scenario('late-capture');

  expect(result.cleanup.transcriptsPurged).toBe(1);
  expect(result.captured).toBe(true);
  expect(result.bytes).toBe(0);
});

test('application-owned cleanup scheduling removes idle expired storage and stops cleanly', async () => {
  const result = await scenario('scheduler');

  expect(result.remaining).toBe(0);
});

test('memory retention preserves both ambiguous effect states and purges terminal-only snapshots', async () => {
  const result = await scenario('memory');

  expect(result.ambiguous).toBe(2);
  expect(result.privateSnapshots).toBe(0);
});

test('maintenance scheduler retries failed passes without logging private database error details', async () => {
  const result = await scenario('scheduler-failure');

  expect(result.remaining).toBe(0);
  expect(
    result.logs.some((message: string) => message.includes('cleanup failed')),
  ).toBe(true);
  expect(result.logs.join(' ')).not.toContain('private fixture detail');
});
