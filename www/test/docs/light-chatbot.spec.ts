import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import {
  applyLightProposal,
  canApplyLightProposal,
  initialLightState,
  type LightAuthorization,
  readLights,
} from '../../examples/quickstart/runtime/light-chatbot';

const origin = { turn: 1, revision: 0 };
const proposal = { lightId: 'desk', brightness: 40 };
const ready: LightAuthorization = {
  turn: 1,
  cancelled: false,
  settled: true,
  error: false,
  interrupted: false,
  finishReason: 'stop',
};

test('reads a fresh 80 percent simulated light and an independent snapshot', () => {
  const state = initialLightState();

  const snapshot = readLights(state);

  expect(snapshot).toEqual({
    revision: 0,
    lights: [{ id: 'desk', name: 'Desk light', brightness: 80 }],
  });
  expect(snapshot).not.toBe(state);
  expect(snapshot.lights).not.toBe(state.lights);
  expect(snapshot.lights[0]).not.toBe(state.lights[0]);
});

test('applies a valid current completed proposal immutably and reads the updated value', () => {
  const state = initialLightState();

  const next = applyLightProposal(state, origin, proposal, ready, false);

  expect(canApplyLightProposal(state, origin, proposal, ready, false)).toBe(
    true,
  );
  expect(next).toEqual({
    revision: 1,
    lights: [{ id: 'desk', name: 'Desk light', brightness: 40 }],
  });
  expect(state.lights[0].brightness).toBe(80);
  expect(readLights(next).lights[0].brightness).toBe(40);
});

test('blocks streaming, cancellation, errors, interrupts, newer turns and unsuccessful finishes', () => {
  const state = initialLightState();
  const conditions: LightAuthorization[] = [
    { ...ready, settled: false },
    { ...ready, cancelled: true },
    { ...ready, error: true },
    { ...ready, interrupted: true },
    { ...ready, turn: 2 },
    ...(
      [
        undefined,
        'length',
        'tool_calls',
        'refusal',
        'content_filter',
        'other',
      ] as const
    ).map((finishReason) => ({ ...ready, finishReason })),
  ];

  const results = conditions.map((auth) =>
    applyLightProposal(state, origin, proposal, auth, false),
  );

  for (const result of results) expect(result).toBe(state);
  for (const auth of conditions)
    expect(canApplyLightProposal(state, origin, proposal, auth, false)).toBe(
      false,
    );
});

test('rejects unknown lights and noninteger or out of range brightness even after completion', () => {
  const state = initialLightState();
  const invalid = [
    { lightId: 'unknown', brightness: 40 },
    ...[-1, 101, 1.5, NaN, Infinity].map((brightness) => ({
      lightId: 'desk',
      brightness,
    })),
  ];

  const results = invalid.map((props) =>
    applyLightProposal(state, origin, props, ready, false),
  );

  for (const result of results) expect(result).toBe(state);
});

test('blocks repeated Apply and other cards captured before the light revision changed', () => {
  const state = initialLightState();
  const next = applyLightProposal(state, origin, proposal, ready, false);

  const repeated = applyLightProposal(next, origin, proposal, ready, true);
  const stale = applyLightProposal(
    next,
    origin,
    { ...proposal, brightness: 70 },
    ready,
    false,
  );

  expect(next.revision).toBe(1);
  expect(repeated).toBe(next);
  expect(stale).toBe(next);
});

test('accepts integer boundary values for the known light', () => {
  const state = initialLightState();

  const results = [0, 100].map((brightness) =>
    applyLightProposal(
      state,
      origin,
      { lightId: 'desk', brightness },
      ready,
      false,
    ),
  );

  expect(results.map((result) => result.lights[0].brightness)).toEqual([
    0, 100,
  ]);
});

test('keeps late and historical assistant cards bound to their original application request', async () => {
  const { lightMessageOrigins } =
    await import('../../examples/quickstart/runtime/light-chatbot');
  const requests = { first: origin, second: { turn: 2, revision: 1 } };
  const messages = [
    { id: 'first', role: 'user' },
    { id: 'old', role: 'assistant' },
    { id: 'second', role: 'user' },
    { id: 'new', role: 'assistant' },
  ];

  const origins = lightMessageOrigins(messages, requests);

  expect(origins.old).toEqual({ turn: 1, revision: 0 });
  expect(origins.new).toEqual({ turn: 2, revision: 1 });
  expect(requests.first).toBe(origin);
});

test.each(['react', 'angular'])(
  '%s chatbot guide follows the canonical proposal and read-only reading',
  (sdk) => {
    const body = readFileSync(
      resolve(
        import.meta.dirname,
        `../../content/docs/${sdk}/recipes/ui-chatbot.md`,
      ),
      'utf8',
    );
    const file =
      sdk === 'react'
        ? 'react/src/UiKitWorkbench.tsx'
        : 'angular/src/app/ui-kit-workbench.ts';

    expect(body).toContain(
      `<hb-docs-demo demo="canonical-workbench-ui-chatbot-${sdk}">`,
    );
    expect(body).toContain(file);
    expect(body).toContain('PlanReading');
    expect(body).toContain('read-only model report');
    expect(body).toContain('Accept plan');
    expect(body).toContain('authoritative application values');
    expect(body).not.toContain('Apply brightness');
  },
);
