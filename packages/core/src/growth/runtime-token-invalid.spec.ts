import { sendFirstBatch } from './testing/first-batch';

jest.mock('#development-install', () => ({
  installationToken: 'not-a-uuid',
}));

test('events carry no installation token when the written value is not a UUID', async () => {
  const missing = undefined;

  const events = await sendFirstBatch();

  expect(events.length).toBeGreaterThan(0);
  expect(events.map((event) => event.installationToken)).toEqual(
    events.map(() => missing),
  );
});
