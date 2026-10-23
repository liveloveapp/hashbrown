import { ɵreadProviderHistory } from './provider-history';

const history = () => ({
  v: 1,
  provider: 'anthropic',
  ownerMessageId: 'assistant-1',
  responseId: 'response-1',
  complete: true,
  payload: { content: [{ type: 'text', text: 'hello' }], container: null },
});

test('reads and deeply owns a provider history envelope', () => {
  const input = history();

  const result = ɵreadProviderHistory(input);
  input.payload.content[0].text = 'changed';

  expect(result).toEqual({ ...history() });
  expect(result).not.toBe(input);
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result?.payload)).toBe(true);
  expect(Object.isFrozen(result?.payload['content'])).toBe(true);
});

test.each([
  undefined,
  null,
  [],
  {},
  { ...history(), v: 2 },
  { ...history(), provider: '' },
  { ...history(), ownerMessageId: '' },
  { ...history(), responseId: '' },
  { ...history(), complete: 'true' },
  { ...history(), payload: [] },
  { ...history(), payload: { value: undefined } },
  { ...history(), payload: { value: NaN } },
  { ...history(), payload: new Date() },
])('ignores malformed or unsupported history %#', (input) => {
  const result = ɵreadProviderHistory(input);

  expect(result).toBeUndefined();
});

test('rejects accessors without invoking them and cyclic JSON', () => {
  const getter = jest.fn(() => 1);
  const input = { ...history() };
  Object.defineProperty(input, 'v', { enumerable: true, get: getter });
  const payload: Record<string, unknown> = {};
  payload['cycle'] = payload;

  const accessor = ɵreadProviderHistory(input);
  const cyclic = ɵreadProviderHistory({ ...history(), payload });

  expect(accessor).toBeUndefined();
  expect(cyclic).toBeUndefined();
  expect(getter).not.toHaveBeenCalled();
});
