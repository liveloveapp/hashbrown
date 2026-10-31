import { expect, test } from 'vitest';
import { assertLocalRecordingAllowed } from '../src/tools/docs-local-models-fixtures';

test('rejects native local-model recording in continuous integration', () => {
  const record = () => assertLocalRecordingAllowed('true');

  expect(record).toThrow('Local model recording must run locally, never in CI');
  expect(() => assertLocalRecordingAllowed('1')).toThrow('never in CI');
});

test('allows a local native-model recording when CI is unset or explicitly false', () => {
  const local = () => assertLocalRecordingAllowed(undefined);

  expect(local).not.toThrow();
  expect(() => assertLocalRecordingAllowed('false')).not.toThrow();
  expect(() => assertLocalRecordingAllowed('0')).not.toThrow();
});
