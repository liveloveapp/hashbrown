// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import posthog from 'posthog-js';
import { expect, test, vi } from 'vitest';
import {
  type UnstuckFacts,
  useUnstuckForm,
} from '../../src/components/unstuck/use-unstuck-form';

vi.mock('posthog-js', () => ({ default: { capture: vi.fn(), init: vi.fn() } }));

const POLICY = 'unstuck_v1.test';
const FACTS: UnstuckFacts = {
  email: 'jordan@acme.dev',
  framework: 'react',
  message: 'I cannot get streaming tool calls to render in my app.',
  website_url: '',
};

function respond(status: number, body: unknown = { ok: true }) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

function bodyOf(fetchMock: ReturnType<typeof respond>, call: number) {
  const init = fetchMock.mock.calls[call] as unknown as [string, RequestInit];
  return JSON.parse(init[1].body as string) as Record<string, unknown>;
}

function eventNames() {
  return vi.mocked(posthog.capture).mock.calls.map((call) => call[0]);
}

test('a 200 posts the envelope to the route and settles as sent', async () => {
  const fetchMock = respond(200);
  vi.stubGlobal('fetch', fetchMock);
  const { result } = renderHook(() =>
    useUnstuckForm({ policyVersion: POLICY }),
  );

  await act(() => result.current.submit(FACTS));

  expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe('/_/forms/unstuck');
  expect(bodyOf(fetchMock, 0)).toMatchObject({
    ...FACTS,
    policy_version: POLICY,
    submission_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
  });
  expect(result.current.status).toBe('sent');
  expect(eventNames()).toEqual([
    'marketing:unstuck_form_submit',
    'marketing:unstuck_form_success',
  ]);
  expect(vi.mocked(posthog.capture).mock.calls[0][1]).toMatchObject({
    surface: 'unstuck',
  });
});

test('identical facts reuse the submission id and changed facts mint a new one', async () => {
  const fetchMock = respond(503, { error: 'x', retryable: true });
  vi.stubGlobal('fetch', fetchMock);
  const { result } = renderHook(() =>
    useUnstuckForm({ policyVersion: POLICY }),
  );

  await act(() => result.current.submit(FACTS));
  await act(() => result.current.submit({ ...FACTS }));
  await act(() =>
    result.current.submit({ ...FACTS, message: `${FACTS.message} More.` }),
  );

  const ids = [0, 1, 2].map((call) => bodyOf(fetchMock, call)['submission_id']);
  expect(ids[0]).toBe(ids[1]);
  expect(ids[2]).not.toBe(ids[0]);
});

test('a second submit while one is in flight sends nothing', async () => {
  let release: (response: Response) => void = () => undefined;
  const fetchMock = vi.fn(
    () => new Promise<Response>((resolve) => (release = resolve)),
  );
  vi.stubGlobal('fetch', fetchMock);
  const { result } = renderHook(() =>
    useUnstuckForm({ policyVersion: POLICY }),
  );

  let first: Promise<void> = Promise.resolve();
  act(() => {
    first = result.current.submit(FACTS);
  });
  await act(() => result.current.submit(FACTS));
  await act(async () => {
    release(new Response('{}', { status: 200 }));
    await first;
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(result.current.status).toBe('sent');
});

test('409 settles as stale and fires no success or fail', async () => {
  vi.stubGlobal('fetch', respond(409, { policy_version: 'newer' }));
  const { result } = renderHook(() =>
    useUnstuckForm({ policyVersion: POLICY }),
  );

  await act(() => result.current.submit(FACTS));

  expect(result.current.status).toBe('stale');
  expect(eventNames()).toEqual(['marketing:unstuck_form_submit']);
});

test('failures fire fail with the matching error_reason and never carry form values', async () => {
  const cases: Array<[() => Promise<Response>, string]> = [
    [async () => new Response('{}', { status: 503 }), 'api_error'],
    [async () => new Response('{}', { status: 429 }), 'rate_limited'],
    [async () => Promise.reject(new TypeError('offline')), 'network_error'],
  ];
  const reasons: unknown[] = [];

  for (const [handler, reason] of cases) {
    vi.mocked(posthog.capture).mockClear();
    vi.stubGlobal('fetch', vi.fn(handler));
    const { result } = renderHook(() =>
      useUnstuckForm({ policyVersion: POLICY }),
    );

    await act(() => result.current.submit(FACTS));

    expect(result.current.status).toBe('failed');
    const fail = vi
      .mocked(posthog.capture)
      .mock.calls.find((call) => call[0] === 'marketing:unstuck_form_fail');
    expect(fail?.[1]).toEqual({
      surface: 'unstuck',
      error_reason: reason,
      source_page: '/',
    });
    reasons.push(reason);
  }

  expect(reasons).toEqual(['api_error', 'rate_limited', 'network_error']);
});

test('reset returns to idle', async () => {
  vi.stubGlobal('fetch', respond(503));
  const { result } = renderHook(() =>
    useUnstuckForm({ policyVersion: POLICY }),
  );
  await act(() => result.current.submit(FACTS));

  act(() => result.current.reset());

  expect(result.current.status).toBe('idle');
});
