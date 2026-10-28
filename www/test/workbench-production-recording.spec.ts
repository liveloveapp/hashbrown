import { expect, test } from 'vitest';
import {
  productionRecordingCues,
  verifyProductionRecording,
} from '../src/tools/workbench-production-recording';

const evidence = {
  source: 'b4run-postgres-openai',
  initialProcessId: 100,
  replacementProcessId: 200,
  runRequestsBeforeRestore: 1,
  runRequestsAfterRestore: 1,
  runRequestsBeforeReplay: 2,
  runRequestsAfterReplay: 2,
  revision: 1,
  receipts: 1,
  restoredInterrupts: 1,
};

test('refuses recording publication without an actual replacement process', () => {
  const input = { ...evidence, replacementProcessId: 100 };

  const result = () => verifyProductionRecording(input);

  expect(result).toThrow(/restart/i);
});

test('refuses a recovery recording that generated another run while restoring', () => {
  const input = { ...evidence, runRequestsAfterRestore: 2 };

  const result = () => verifyProductionRecording(input);

  expect(result).toThrow(/restore/i);
});

test('refuses a recovery recording with repeated application effects', () => {
  const input = { ...evidence, receipts: 2 };

  const result = () => verifyProductionRecording(input);

  expect(result).toThrow(/receipt/i);
});

test('builds readable captions only from ordered measured phases', () => {
  const phases = {
    paused: 6,
    restarted: 10,
    restored: 14,
    approved: 20,
    replay: 24,
    returnedLive: 28,
  };

  const cues = productionRecordingCues(phases, 31);

  expect(cues).toHaveLength(7);
  expect(cues.at(-1)).toEqual([28, 31, 'Back live. Plan revision 1.']);
  expect(() =>
    productionRecordingCues({ ...phases, restored: 9 }, 31),
  ).toThrow();
});
