import { DecisionError } from '@hashbrownai/typesafe';
import { expect, test, vi } from 'vitest';
import {
  AGENT_CLARIFICATION,
  agentSchema,
  routeAgent,
} from '../../examples/quickstart/server/agent-routing';

const envelope = (route: string, confidence = 0.9) => ({
  kind: 'hashbrown.decision',
  version: 1,
  value: { route },
  meta: { route: { confidence, probabilities: { [route]: confidence } } },
});
const signal = () => new AbortController().signal;

test('routes known orders and returns to read-only public example replies', async () => {
  const classify = vi.fn(async () => envelope('order'));

  const order = await routeAgent('Where is order HB-1042?', classify, signal());
  const returns = await routeAgent(
    'What is the returns policy?',
    async () => envelope('returns'),
    signal(),
  );

  expect(order).toContain('HB-1042');
  expect(order).toContain('shipped');
  expect(returns).toContain('30 days');
});

test.each([
  'Where is my order?',
  'Where is HB-9999?',
  'Compare HB-1042 and HB-9999',
])('application validates order identity: %s', async (text) => {
  const classify = async () => envelope('order');

  const result = await routeAgent(text, classify, signal());

  expect(result).toBe(AGENT_CLARIFICATION);
});

test.each([-1, -0.01, 0, 0.69, 1.01, Infinity, -Infinity, NaN])(
  'confidence %s cannot enter an order handler',
  async (confidence) => {
    const order = vi.fn(() => 'unsafe handler');

    const result = await routeAgent(
      'HB-1042',
      async () => envelope('order', confidence),
      signal(),
      { order },
    );

    expect(result).toBe(AGENT_CLARIFICATION);
    expect(order).not.toHaveBeenCalled();
  },
);

test.each([0.7, 1])(
  'confidence %s meets the application threshold',
  async (confidence) => {
    const classify = async () => envelope('returns', confidence);

    const result = await routeAgent('Returns?', classify, signal());

    expect(result).toContain('30 days');
  },
);

test.each([
  null,
  {},
  { kind: 'wrong' },
  envelope('unknown'),
  { ...envelope('order'), version: 2 },
  { ...envelope('order'), meta: {} },
])('malformed envelope returns clarification', async (response) => {
  const classify = async () => response;

  const result = await routeAgent('HB-1042', classify, signal());

  expect(result).toBe(AGENT_CLARIFICATION);
});

test('explicit clarify and expected provider errors ask a bounded follow-up', async () => {
  const failure = new DecisionError('upstream', 502, 'PRIVATE credential');

  const clarification = await routeAgent(
    'Help',
    async () => envelope('clarify'),
    signal(),
  );
  const failed = await routeAgent(
    'Help',
    async () => {
      throw failure;
    },
    signal(),
  );

  expect(clarification).toBe(AGENT_CLARIFICATION);
  expect(failed).toBe(AGENT_CLARIFICATION);
});

test('unexpected failures propagate for a failed run', async () => {
  const error = new TypeError('programming failure');

  const result = routeAgent(
    'Help',
    async () => {
      throw error;
    },
    signal(),
  );

  await expect(result).rejects.toBe(error);
});

test('classifier receives only the text, pinned schema and caller signal', async () => {
  const classify = vi.fn(async () => envelope('returns'));
  const controller = new AbortController();

  await routeAgent('Returns?', classify, controller.signal);

  expect(classify).toHaveBeenCalledExactlyOnceWith({
    request: { state: 'Returns?' },
    schema: agentSchema,
    signal: controller.signal,
  });
});

test('abort before classifier avoids all work', async () => {
  const controller = new AbortController();
  const reason = new Error('stopped');
  controller.abort(reason);
  const classify = vi.fn(async () => envelope('order'));

  const result = routeAgent('HB-1042', classify, controller.signal);

  await expect(result).rejects.toBe(reason);
  expect(classify).not.toHaveBeenCalled();
});

test.each([false, true])(
  'abort during classifier never becomes fallback or runs a handler (known error %s)',
  async (knownError) => {
    const controller = new AbortController();
    const reason = new Error('stopped');
    const order = vi.fn(() => 'unsafe');
    const classify = async () => {
      controller.abort(reason);
      if (knownError) throw new DecisionError('upstream', 502, 'failure');
      return envelope('order');
    };

    const result = routeAgent('HB-1042', classify, controller.signal, {
      order,
    });

    await expect(result).rejects.toBe(reason);
    expect(order).not.toHaveBeenCalled();
  },
);
