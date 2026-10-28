import { runInNewContext } from 'node:vm';
import { expect, test } from 'vitest';
import { createWorkbenchStore } from '../examples/quickstart/runtime/workbench';
import {
  captureWorkbenchJavaScriptValue,
  normalizeWorkbenchJavaScriptObservation,
  readWorkbenchJavaScriptPlan,
  workbenchJavaScriptScripts,
} from '../examples/quickstart/runtime/workbench-javascript';
import {
  getWorkbenchLesson,
  workbenchLessonGroups,
  workbenchLessons,
} from '../examples/quickstart/runtime/workbench-lessons';

test('readPlan returns a detached immutable application snapshot', () => {
  const application = {
    revision: 0,
    plan: { title: 'Plan', steps: ['First', 'Second'] },
  };

  const result = readWorkbenchJavaScriptPlan({ revision: 0 }, application);
  application.plan.steps[0] = 'Changed';

  expect(result).toEqual({
    revision: 0,
    plan: { title: 'Plan', steps: ['First', 'Second'] },
  });
  expect(Object.isFrozen(result.plan.steps)).toBe(true);
});

test('readPlan validates the exact arguments and current valid application revision', () => {
  const application = createWorkbenchStore('text').getSnapshot().application;
  const invalid = [
    null,
    [],
    {},
    { revision: '0' },
    { revision: -1 },
    { revision: 0.5 },
    { revision: Infinity },
    { revision: NaN },
    { revision: Number.MAX_SAFE_INTEGER + 1 },
    { revision: 0, extra: true },
    { revision: 1 },
  ];

  for (const args of invalid)
    expect(() => readWorkbenchJavaScriptPlan(args, application)).toThrow();

  expect(() =>
    readWorkbenchJavaScriptPlan({ revision: 0 }, { revision: 0, plan: null }),
  ).toThrow();
  expect(() =>
    readWorkbenchJavaScriptPlan(
      { revision: 0 },
      { revision: 0, plan: { title: '', steps: ['a', 'b'] } },
    ),
  ).toThrow();
});

test('runtime observations strip executable values and bound captured data without retaining references', () => {
  const circular: Record<string, unknown> = {
    title: 'Outcome',
    callback: () => undefined,
  };
  circular['self'] = circular;
  const input = {
    runId: 'run-1',
    code: 'return 1;',
    status: 'complete',
    calls: [
      {
        name: 'readPlan',
        args: { revision: 0 },
        result: readWorkbenchJavaScriptPlan(
          { revision: 0 },
          createWorkbenchStore('text').getSnapshot().application,
        ),
        ignored: () => undefined,
      },
    ],
    outcome: circular,
    ignored: () => undefined,
  };

  const result = normalizeWorkbenchJavaScriptObservation(input);
  input.calls[0].args.revision = 9;

  expect(result?.calls[0].args).toEqual({ revision: 0 });
  expect(JSON.stringify(result)).not.toContain('callback');
  expect(result).not.toHaveProperty('ignored');
  expect(Object.isFrozen(result?.calls)).toBe(true);
  expect(JSON.stringify(result).length).toBeLessThan(40000);
  expect(
    normalizeWorkbenchJavaScriptObservation({
      ...input,
      code: 'x'.repeat(12001),
    }),
  ).toBeNull();
  expect(
    normalizeWorkbenchJavaScriptObservation({ ...input, status: 'fake' }),
  ).toBeNull();
});

test('store captures current runtime observations per frame and rejects stale or replay writes', () => {
  const store = createWorkbenchStore('text');
  const first = store.send('Run estimate');
  const observation = {
    runId: first.id,
    code: 'return 30;',
    status: 'complete',
    calls: [],
    outcome: { totalMinutes: 30 },
  };

  expect(store.recordJavaScript(observation, 'stale')).toBe(false);
  expect(store.recordJavaScript(observation, first.id)).toBe(true);
  const captured = store.getSnapshot().events.length - 1;
  store.recordRecipe(
    {
      kind: 'text',
      markdown: 'Application-rendered runtime result: 30 minutes',
    },
    first.id,
  );
  store.settle('complete', 'stop');
  store.seek(captured);

  expect(store.getSnapshot().frame?.javascript?.outcome).toEqual({
    totalMinutes: 30,
  });
  expect(store.recordJavaScript(observation, first.id)).toBe(false);
  store.live();
  const next = store.send('Run shorter estimate');
  expect(store.getSnapshot().frame?.javascript).toBeUndefined();
  expect(store.recordJavaScript(observation, first.id)).toBe(false);
  expect(
    store.recordJavaScript(
      { ...observation, runId: next.id, outcome: { totalMinutes: 20 } },
      next.id,
    ),
  ).toBe(true);
  expect(store.getSnapshot().events[captured].javascript?.outcome).toEqual({
    totalMinutes: 30,
  });
  store.clear();
  expect(store.recordJavaScript(observation, next.id)).toBe(false);
  expect(store.getSnapshot().application.revision).toBe(0);
});

test('runtime lesson resolves in concepts with no provider endpoint and explicit application scripts', () => {
  const lesson = getWorkbenchLesson('?lesson=javascript-runtime');

  expect(lesson).toMatchObject({
    id: 'javascript-runtime',
    protocol: 'runtime',
    format: 'text',
    inspector: 'Runtime',
    endpoint: '',
  });
  expect(workbenchLessons).toHaveLength(29);
  expect(
    workbenchLessonGroups.find((group) => group.id === 'concepts')?.lessons,
  ).toContain('javascript-runtime');
  expect(workbenchJavaScriptScripts.map((script) => script.id)).toEqual([
    'estimate',
    'shorter',
    'browser',
    'invalid',
    'loop',
    'fresh',
  ]);
  expect(workbenchJavaScriptScripts[0].code).toContain(
    'readPlan({ revision: 0 })',
  );
  expect(workbenchJavaScriptScripts[0].code).toContain('* 15');
  expect(workbenchJavaScriptScripts[1].code).toContain('* 10');
});

test('estimate presets evaluate as scripts with synchronous QuickJS host bindings', () => {
  const application = createWorkbenchStore('text').getSnapshot().application;
  const host = {
    readPlan: (args: unknown) =>
      readWorkbenchJavaScriptPlan(
        JSON.parse(JSON.stringify(args)),
        application,
      ),
  };

  const estimate = runInNewContext(workbenchJavaScriptScripts[0].code, host);
  const shorter = runInNewContext(workbenchJavaScriptScripts[1].code, {
    ...host,
  });

  expect(estimate).toMatchObject({
    revision: 0,
    stepCount: 2,
    totalMinutes: 30,
  });
  expect(shorter).toMatchObject({
    revision: 0,
    stepCount: 2,
    totalMinutes: 20,
  });
});

test('observation statuses reject non-string values without invoking coercion callbacks', () => {
  let coercions = 0;
  const status = {
    toString: () => {
      coercions++;
      return 'complete';
    },
  };

  const result = normalizeWorkbenchJavaScriptObservation({
    runId: 'run-1',
    code: '1;',
    calls: [],
    status,
  });

  expect(result).toBeNull();
  expect(coercions).toBe(0);
});

test('captured values skip object and array accessors without running callbacks', () => {
  let reads = 0;
  const array: unknown[] = [];
  Object.defineProperty(array, '0', {
    get: () => {
      reads++;
      return 'secret';
    },
    enumerable: true,
  });
  const value = { array };
  Object.defineProperty(value, 'getter', {
    get: () => {
      reads++;
      return 'secret';
    },
    enumerable: true,
  });

  const captured = captureWorkbenchJavaScriptValue(value);

  expect(captured).toEqual({ array: [null] });
  expect(reads).toBe(0);
});
