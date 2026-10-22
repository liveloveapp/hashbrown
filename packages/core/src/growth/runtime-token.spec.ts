import { sendFirstBatch } from './testing/first-batch';

const TOKEN = '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60';

jest.mock('#development-install', () => ({
  installationToken: '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60',
}));

test('events carry the installation token the postinstall step wrote', async () => {
  const expected = TOKEN;

  const events = await sendFirstBatch();

  expect(events.length).toBeGreaterThan(0);
  expect(events.map((event) => event.installationToken)).toEqual(
    events.map(() => expected),
  );
});
