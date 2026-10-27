import { expect, test } from 'vitest';
import { workbenchServerInspection } from '../examples/quickstart/runtime/workbench-server-view';
import type { WorkbenchServerHistoryState } from '../examples/quickstart/runtime/workbench-server-history';

const server: WorkbenchServerHistoryState = {
  selectedSlot: 'Lighthouse',
  threadId: 'opaque-id',
  version: 1,
  snapshot: { id: 'opaque-id', version: 1, messages: [] },
  access: 'local-demo',
  threads: null,
  foreignThreadId: null,
  operations: [
    {
      action: 'load-server',
      method: 'GET',
      path: '/api/workbench/server/server-threads/threads/opaque-id',
      status: 200,
      source: 'demo-server',
    },
  ],
  busy: false,
  error: null,
};

test('server inspection projects saved text independently from access operations', () => {
  const projection = workbenchServerInspection('Server', server);

  expect(projection?.value).toEqual({
    selectedSlot: 'Lighthouse',
    threadId: 'opaque-id',
    version: 1,
    snapshot: server.snapshot,
  });
  expect(projection?.detail).toMatchObject({ operations: server.operations });
  expect(workbenchServerInspection('Access', server)?.value).toMatchObject({
    access: 'local-demo',
    checks: [{ action: 'load-server', status: 200 }],
  });
  expect(workbenchServerInspection('Text', server)).toBeUndefined();
});

test('empty and historical server projection carries no live fetch or session token', () => {
  const projection = workbenchServerInspection('Access', undefined);

  expect(projection?.value).toEqual({
    access: 'unknown',
    latestOperation: null,
    checks: [],
  });
  expect(
    JSON.stringify(workbenchServerInspection('Server', server)),
  ).not.toContain('foreignThreadId');
  expect(JSON.stringify(projection)).not.toContain('cookie');
});
