import { expect, test } from 'vitest';
import { readProductionRecovery } from '../examples/quickstart/runtime/workbench-production';
import { pinWorkbenchInput } from '../examples/quickstart/server/workbench-app';
import {
  getWorkbenchLesson,
  hostedWorkbenchLessons,
} from '../examples/quickstart/runtime/workbench-lessons';

test('rejects incompatible recovery configurations before SDK restoration', () => {
  const input = { configuration: 'old', disposition: 'idle', snapshot: {} };

  const result = () => readProductionRecovery(input);

  expect(result).toThrow(/configuration/i);
});

test('accepts an owned native recovery snapshot without generating history', () => {
  const input = {
    configuration: 'recording-plan-v1',
    disposition: 'idle',
    snapshot: { threadId: 'thread-1', messages: [] },
    application: { revision: 0, plan: null },
  };

  const result = readProductionRecovery(input);

  expect(result).toEqual(input);
});

test('refuses a recovery response whose application revision is invalid', () => {
  const input = {
    configuration: 'recording-plan-v1',
    disposition: 'idle',
    snapshot: { threadId: 'thread-1', messages: [] },
    application: { revision: -1, plan: null },
  };

  const result = () => readProductionRecovery(input);

  expect(result).toThrow(/recovery/i);
});

test('the public process-memory provider cannot run the production reference lesson', () => {
  const input = {
    threadId: 'thread-1',
    runId: 'run-1',
    messages: [{ id: 'user-1', role: 'user', content: 'Plan a demo' }],
    tools: [],
    context: [],
    state: { planTitle: 'Demo', status: 'idle' },
    forwardedProps: {},
  };

  const result = () => pinWorkbenchInput(input, 'production-recovery');

  expect(result).toThrow(/production reference/i);
});

test('the production lesson is opt-in and preserves the public default and catalog', () => {
  const lesson = getWorkbenchLesson('?lesson=production-recovery');

  const publicIds = hostedWorkbenchLessons.map((entry) => entry.id);

  expect(lesson.host).toBe('production-reference');
  expect(publicIds).not.toContain('production-recovery');
  expect(publicIds).toHaveLength(28);
  expect(getWorkbenchLesson('').id).toBe('generative-ui');
});
