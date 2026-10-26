import { expect, test } from 'vitest';
import { createChatService } from './chat-service';

test('the default service starts without optional runtime storage or signing settings', async () => {
  const env = { VERCEL: '1' };

  const service = await createChatService({
    run: { apiKey: 'unused', model: 'gpt-5-mini' },
    env,
  });

  expect(typeof service.handler).toBe('function');
  await expect(service.close()).resolves.toBeUndefined();
});

test('a selected agent service reports its own startup failure without fallback', async () => {
  const env = { VERCEL: '1', ATC_CHAT_BACKEND: 'b4run' };

  const service = createChatService({
    run: { apiKey: 'unused', model: 'gpt-5-mini' },
    env,
  });

  await expect(service).rejects.toThrow('ATC_B4RUN_COOKIE_SECRET');
});
