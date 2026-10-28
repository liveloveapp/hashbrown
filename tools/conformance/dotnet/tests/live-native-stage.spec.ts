import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readLiveNativeStage } from '../harness/live-browser-fixture';

for (const callerDeadline of [false, true])
  test(`native-stage metadata bounds a stalled HTTP body with ${callerDeadline ? 'case cancellation' : 'an independent five second deadline'}`, async () => {
    const controller = new AbortController();
    const server = createServer((_, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.flushHeaders();
      if (callerDeadline) controller.abort();
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const fixture = {
      url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      ...(callerDeadline ? { signal: controller.signal } : {}),
    };
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const outcome = await Promise.race([
        readLiveNativeStage(fixture).then(
          () => 'resolved',
          () => 'aborted',
        ),
        new Promise<string>((accept) => {
          timer = setTimeout(
            () => accept('stalled'),
            callerDeadline ? 500 : 5_500,
          );
        }),
      ]);

      expect(outcome).toBe('aborted');
    } finally {
      clearTimeout(timer);
      server.closeAllConnections();
      await new Promise<void>((accept) => server.close(() => accept()));
    }
  });

test('native-stage metadata reads the exact real gate stage and ignores unrelated fields', async () => {
  let requests = 0;
  const server = createServer((request, response) => {
    request.resume();
    requests++;
    response.writeHead(request.url === '/__test/native-stage' ? 200 : 404, {
      'Content-Type': 'application/json',
    });
    response.end(
      JSON.stringify({
        stage: 'before-pending-save',
        privateValue: 'STAGE_PRIVATE_CANARY',
        arbitrary: { nested: true },
      }),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const fixture = {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  };

  try {
    const stage = await readLiveNativeStage(fixture);

    expect(stage).toBe('before-pending-save');
    expect(requests).toBe(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((accept) => server.close(() => accept()));
  }
});
