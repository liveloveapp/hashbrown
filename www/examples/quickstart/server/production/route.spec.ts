import { expect, test } from 'vitest';
import { createProductionRoute } from './route';

test('authored runtime exposes one empty-argument native approval tool and directs the model to invoke it', () => {
  const route = createProductionRoute(async () => ({
    result: 'accepted',
    state: { revision: 1, plan: null },
  }));

  const tool = route.tools[0];

  expect(route.tools).toHaveLength(1);
  expect(tool.name).toBe('acceptPlan');
  expect(tool.schema).toEqual({
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  });
  expect(tool.returnDirect).toBe(true);
  expect(JSON.stringify(route.module)).toContain(
    'Never ask for approval in prose',
  );
});

test('isolates static module cache identities for independent runtime instances', () => {
  const left = createProductionRoute(async () => 'left');
  const right = createProductionRoute(async () => 'right');

  expect(left.routeFile).not.toBe(right.routeFile);
  expect(left.assistantId).toBe(right.assistantId);
});
