import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  localNativeApprovalStats,
  waitForLocalNativeApprovalServer,
  withLocalNativeApprovalResources,
} from '../harness/local-native-approval-browser';

test('local browser context acquisition failure drains previously acquired static and temporary resources', async () => {
  const closed: string[] = [];
  const failure = new Error('context creation failed');

  const outcome = withLocalNativeApprovalResources(async (own) => {
    own(async () => {
      closed.push('temporary');
    });
    own(async () => {
      closed.push('static');
    });
    throw failure;
  });

  await expect(outcome).rejects.toBe(failure);
  expect(closed).toEqual(['static', 'temporary']);
});

test('local browser context close failure still drains native, static and temporary resources', async () => {
  const closed: string[] = [];
  const failure = new Error('context close failed');

  const outcome = withLocalNativeApprovalResources(async (own) => {
    own(async () => {
      closed.push('temporary');
    });
    own(async () => {
      closed.push('static');
    });
    own(async () => {
      closed.push('native');
    });
    own(async () => {
      closed.push('context');
      throw failure;
    });
    return 'done';
  });

  await expect(outcome).rejects.toThrow();
  expect(closed).toEqual(['context', 'native', 'static', 'temporary']);
});

test('local browser cleanup retains both the original operation error and cleanup error', async () => {
  const primary = new Error('scenario failed');
  const secondary = new Error('close failed');

  const outcome = withLocalNativeApprovalResources(async (own) => {
    own(async () => {
      throw secondary;
    });
    throw primary;
  });

  await expect(outcome).rejects.toMatchObject({ errors: [primary, secondary] });
});

test('local stats cancels a genuinely stalled response with the caller phase deadline', async () => {
  const controller = new AbortController();
  const server = createServer((_, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.flushHeaders();
    controller.abort();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const result = await Promise.race([
      localNativeApprovalStats(url, controller.signal).then(
        () => 'resolved',
        () => 'aborted',
      ),
      new Promise<string>((accept) => setTimeout(() => accept('stalled'), 250)),
    ]);

    expect(result).toBe('aborted');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((accept) => server.close(() => accept()));
  }
});

test('local stats independently bounds a stalled body when no caller deadline is supplied', async () => {
  const server = createServer((_, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.flushHeaders();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race([
      localNativeApprovalStats(url).then(
        () => 'resolved',
        () => 'aborted',
      ),
      new Promise<string>((accept) => {
        timer = setTimeout(() => accept('stalled'), 5_500);
      }),
    ]);

    expect(result).toBe('aborted');
  } finally {
    clearTimeout(timer);
    server.closeAllConnections();
    await new Promise<void>((accept) => server.close(() => accept()));
  }
});

test('a genuine local spawn failure rejects startup and drains earlier acquired resources', async () => {
  const closed: string[] = [];

  const outcome = withLocalNativeApprovalResources(async (own) => {
    own(async () => {
      closed.push('temporary');
    });
    own(async () => {
      closed.push('static');
    });
    const worker = spawn('/definitely-absent/hashbrown-native-probe', [], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForLocalNativeApprovalServer(worker);
  });

  await expect(outcome).rejects.toThrow('LOCAL_NATIVE_SPAWN_FAILED');
  expect(closed).toEqual(['static', 'temporary']);
});
