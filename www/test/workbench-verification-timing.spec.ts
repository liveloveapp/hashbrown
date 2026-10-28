import { expect, test } from 'vitest';
import { workbenchVerificationTiming } from '../src/tools/workbench-verification-timing';

test('ordinary fixtures finish promptly without removing the pre-verdict checkpoint', () => {
  const timing = workbenchVerificationTiming(false, 'tools');

  expect(timing.chunkMs).toBeLessThan(20);
  expect(timing.verdictMs).toBeGreaterThanOrEqual(100);
});

test('streaming lessons retain observable intermediate frames', () => {
  const ordinary = workbenchVerificationTiming(false, 'tools');

  const streaming = workbenchVerificationTiming(false, 'streaming');
  const onboarding = workbenchVerificationTiming(false, 'first-plan');

  expect(streaming.chunkMs).toBe(80);
  expect(onboarding.chunkMs).toBe(80);
  expect(streaming.chunkMs).toBeGreaterThan(ordinary.chunkMs);
});

test('recordings retain their original chunk and verdict pacing', () => {
  const timing = workbenchVerificationTiming(true, 'tools');

  expect(timing).toEqual({ chunkMs: 80, verdictMs: 400 });
});

test('fixture terminal events wait until the browser has observed the preview', async () => {
  const { createWorkbenchPreview } =
    await import('../src/tools/workbench-verification-timing');
  const preview = createWorkbenchPreview();
  const signal = new AbortController().signal;
  let finished = false;
  const waiting = preview.wait(signal).then(() => {
    finished = true;
  });

  await Promise.resolve();
  expect(finished).toBe(false);
  preview.release();
  await waiting;

  expect(finished).toBe(true);
});

test('an aborted fixture does not retain a preview waiter', async () => {
  const { createWorkbenchPreview } =
    await import('../src/tools/workbench-verification-timing');
  const preview = createWorkbenchPreview();
  const abort = new AbortController();
  const waiting = preview.wait(abort.signal);

  abort.abort();
  await waiting;

  expect(abort.signal.aborted).toBe(true);
});

test('a streamed plan pauses the producer until its browser preview is observed', async () => {
  const { createWorkbenchPlanPreview } =
    await import('../src/tools/workbench-verification-timing');
  const preview = createWorkbenchPlanPreview();
  const signal = new AbortController().signal;
  let advanced = false;
  await preview.wait(
    '{"ui":[{"SummaryCard":{"props":{"title":"Show a trusted component",',
    signal,
  );

  const waiting = preview.wait('"steps":["Outline', signal).then(() => {
    advanced = true;
  });
  await Promise.resolve();

  expect(advanced).toBe(false);
  preview.release();
  await waiting;
  expect(advanced).toBe(true);
  await preview.wait(' the demo","Record the demo"]}}}]}', signal);
});

test('cancelling a streamed plan releases its partial preview waiter', async () => {
  const { createWorkbenchPlanPreview } =
    await import('../src/tools/workbench-verification-timing');
  const preview = createWorkbenchPlanPreview();
  const controller = new AbortController();

  const waiting = preview.wait(
    '{"title":"Show","steps":["Outline',
    controller.signal,
  );
  controller.abort();
  await waiting;

  expect(controller.signal.aborted).toBe(true);
});
