import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { parseWorkbenchCapture } from '../examples/quickstart/runtime/workbench-capture';
import { assertPublishableCapture } from '../src/tools/workbench-capture-file';

test.each(['react', 'angular'] as const)(
  '%s production recording includes a publishable native recovery replay',
  (framework) => {
    const path = resolve(
      'www/public/video/docs',
      `canonical-workbench-production-recovery-${framework}-capture.json`,
    );

    const capture = parseWorkbenchCapture(
      JSON.parse(readFileSync(path, 'utf8')),
    );

    expect(capture).not.toBeNull();
    if (!capture) throw new Error('Invalid production reference capture');
    expect(() =>
      assertPublishableCapture(capture, {
        framework,
        lesson: 'production-recovery',
      }),
    ).not.toThrow();
    expect(capture.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(Number.isFinite(Date.parse(capture.recordedAt))).toBe(true);
    expect(capture.events.some((event) => event.kind === 'resume')).toBe(true);
    const requests = capture.events.filter((event) => event.kind === 'request');
    expect(requests).toHaveLength(1);
    expect(requests[0].payload).toMatchObject({
      url: '/api/production/run',
      input: { resume: [{ status: 'resolved', payload: 'once' }] },
    });
    expect(
      capture.events
        .filter((event) => event.kind === 'event')
        .map((event) => event.payload),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'RUN_FINISHED',
          outcome: expect.objectContaining({ type: 'success' }),
        }),
      ]),
    );
    expect(
      capture.events.some(
        (event) => event.production?.application?.revision === 1,
      ),
    ).toBe(true);
    expect(capture.events.at(-1)?.status).toBe('complete');
  },
);
