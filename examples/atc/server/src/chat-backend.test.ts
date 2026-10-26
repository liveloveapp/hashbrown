import { expect, test, vi } from 'vitest';
import { createChatHandler, readChatBackend } from './chat-backend';
import type { NodeHandler } from './http';

test('chat backend defaults to OpenAI and accepts explicit supported values', () => {
  const values = [undefined, 'openai', 'b4run'];

  const backends = values.map((value) => readChatBackend(value));

  expect(backends).toEqual(['openai', 'openai', 'b4run']);
});

test('an empty or unknown backend fails configuration validation', () => {
  const values = ['', 'B4RUN', 'other'];

  const reads = values.map((value) => () => readChatBackend(value));

  reads.forEach((read) => expect(read).toThrow('ATC_CHAT_BACKEND'));
});

test('OpenAI selection never initializes b4.run or reads its configuration', async () => {
  const handler: NodeHandler = async () => undefined;
  const openai = vi.fn(() => handler);
  const b4run = vi.fn(() => {
    throw new Error('Storage settings unavailable');
  });

  const selected = await createChatHandler('openai', { openai, b4run });

  expect(selected).toBe(handler);
  expect(openai).toHaveBeenCalledOnce();
  expect(b4run).not.toHaveBeenCalled();
});

test('b4.run selection initializes once and never falls back on failure', async () => {
  const failure = new Error('Storage settings unavailable');
  const openai = vi.fn();
  const b4run = vi.fn(async () => {
    throw failure;
  });

  const selected = createChatHandler('b4run', { openai, b4run });

  await expect(selected).rejects.toBe(failure);
  expect(openai).not.toHaveBeenCalled();
  expect(b4run).toHaveBeenCalledOnce();
});
