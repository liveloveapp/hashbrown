import { waitForNativeRecovery } from '../harness/wait-for-native-recovery';

test('waits for asynchronous request cleanup before reading the final recovery state', async () => {
  const states = [
    { disposition: 'Busy' },
    { disposition: 'FailedBeforeEffect' },
  ];
  let reads = 0;

  const result = await waitForNativeRecovery(async () => states[reads++]);

  expect(result).toEqual({ disposition: 'FailedBeforeEffect' });
  expect(reads).toBe(2);
});

test('does not retry an unexpected terminal disposition', async () => {
  let reads = 0;

  const result = await waitForNativeRecovery(async () => {
    reads++;
    return { disposition: 'PublicationUnknown' };
  });

  expect(result).toEqual({ disposition: 'PublicationUnknown' });
  expect(reads).toBe(1);
});

test('fails within its budget if request cleanup remains busy', async () => {
  const read = async () => ({ disposition: 'Busy' });

  const result = waitForNativeRecovery(read, 0);

  await expect(result).rejects.toThrow('Native recovery remained Busy');
});

test('does not retry failed recovery requests', async () => {
  const failure = new Error('Recovery request failed');
  const read = async (): Promise<{ disposition: string }> => {
    throw failure;
  };

  const result = waitForNativeRecovery(read);

  await expect(result).rejects.toBe(failure);
});
