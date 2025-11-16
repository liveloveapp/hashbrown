/* eslint-disable @typescript-eslint/no-explicit-any */
import { fryHashbrown, s, Chat, Hashbrown } from '..';
import {
  createHashbrownServer,
  expectWithOpenAIEval,
  waitUntilHashbrownIsSettled,
} from './helpers';
import { e2eProviderMatrix } from './providers';

jest.setTimeout(20_000);

describe.each(e2eProviderMatrix)('%s provider E2E', (provider) => {
  if (!provider.isConfigured) {
    test.skip(`skipping ${provider.displayName}: ${provider.reason ?? 'missing config'}`, () => {
      /* skipped */
    });
    return;
  }

  let server: { url: string; close: () => void };

  beforeAll(async () => {
    server = await createHashbrownServer(provider.createIterator);
  });

  afterAll(() => {
    server?.close();
  });

  test('streams text responses and stays on topic', async () => {
    const hashbrown = fryHashbrown({
      debounce: 0,
      apiUrl: server.url,
      model: provider.model,
      system: `You are running Hashbrown E2E tests for ${provider.displayName}. Provide a short greeting and mention Hashbrown by name.`,
      messages: [
        {
          role: 'user',
          content: 'Say hello and mention Hashbrown.',
        },
      ],
    });

    const teardown = hashbrown.sizzle();
    await waitUntilHashbrownIsSettled(hashbrown);
    const assistantMessage = getLastAssistantMessage(hashbrown);
    teardown();

    await expectWithOpenAIEval({
      candidate: assistantMessage?.content ?? '',
      expectation: `A greeting from ${provider.displayName} that mentions Hashbrown.`,
      rubric: 'The message should greet the user and explicitly mention Hashbrown.',
      fallbackAssertion: () => {
        expect(assistantMessage?.content).toEqual(
          expect.stringContaining('Hashbrown'),
        );
      },
    });
  });

  test('handles tool calling and returns tool results', async () => {
    let toolCallArgs: any;
    const expectedResponse = 'E2E tool executed successfully for Hashbrown.';

    const hashbrown = fryHashbrown({
      debounce: 0,
      apiUrl: server.url,
      model: provider.model,
      system: `You are validating tool calls for ${provider.displayName}. Call the "test_tool" function when asked and return its payload to the user.`,
      messages: [
        {
          role: 'user',
          content: 'Run the test tool and share its response.',
        },
      ],
      tools: [
        {
          name: 'test_tool',
          description: 'Echoes structured data for validation',
          schema: s.object('args', {
            text: s.string(''),
          }),
          handler: async (args: { text: string }): Promise<{ text: string }> => {
            toolCallArgs = args;
            return { text: expectedResponse };
          },
        },
      ],
    });

    const teardown = hashbrown.sizzle();
    await waitUntilHashbrownIsSettled(hashbrown);
    const assistantMessage = getLastAssistantMessage(hashbrown);
    teardown();

    expect(toolCallArgs).toEqual({ text: expect.any(String) });
    await expectWithOpenAIEval({
      candidate: assistantMessage?.content ?? '',
      expectation: 'The assistant should return the tool output and not invent new content.',
      rubric: `The response should include "${expectedResponse}" and acknowledge the tool was used.`,
      fallbackAssertion: () => {
        expect(assistantMessage?.content).toEqual(
          expect.stringContaining(expectedResponse),
        );
      },
    });
  });

  const structuredOutputsTitle = provider.emulateStructuredOutputs
    ? 'emulated structured outputs'
    : 'native structured outputs';

  (provider.supportsStructuredOutputs || provider.emulateStructuredOutputs
    ? test
    : test.skip)(`returns ${structuredOutputsTitle} with the Hashbrown schema`, async () => {
    const hashbrown = fryHashbrown({
      debounce: 0,
      apiUrl: server.url,
      model: provider.model,
      emulateStructuredOutput: provider.emulateStructuredOutputs,
      system: `Return a JSON object describing the focus of Hashbrown for ${provider.displayName}.`,
      messages: [
        {
          role: 'user',
          content: 'Provide a brief JSON summary of what Hashbrown does.',
        },
      ],
      responseSchema: s.object('response', {
        summary: s.string(''),
        focus: s.string(''),
      }),
    });

    const teardown = hashbrown.sizzle();
    await waitUntilHashbrownIsSettled(hashbrown);
    const assistantMessage = getLastAssistantMessage(hashbrown);
    teardown();

    expect(assistantMessage?.content).toEqual(
      expect.objectContaining({
        summary: expect.any(String),
        focus: expect.any(String),
      }),
    );

    await expectWithOpenAIEval({
      candidate: assistantMessage?.content ?? {},
      expectation: 'A concise JSON object summarizing Hashbrown.',
      rubric: 'The JSON should capture Hashbrown as a chat framework and identify its focus.',
      fallbackAssertion: () => {
        const content = assistantMessage?.content as { summary?: string; focus?: string };
        expect(content?.summary).toBeTruthy();
        expect(content?.focus).toBeTruthy();
      },
    });
  });

  (provider.supportsUiChat ? test : test.skip)(
    'supports multi-turn UI chat flows',
    async () => {
      const hashbrown = fryHashbrown({
        debounce: 0,
        apiUrl: server.url,
        model: provider.model,
        system: 'You are powering a UI chat demo for Hashbrown. Keep answers concise.',
        messages: [
          {
            role: 'user',
            content: 'What is Hashbrown? Keep it short.',
          },
        ],
      });

      const teardown = hashbrown.sizzle();
      await waitUntilHashbrownIsSettled(hashbrown);

      hashbrown.sendMessage({
        role: 'user',
        content: 'Summarize that again with a friendly tone.',
      });

      await waitUntilHashbrownIsSettled(hashbrown);
      const assistantMessage = getLastAssistantMessage(hashbrown);
      teardown();

      await expectWithOpenAIEval({
        candidate: assistantMessage?.content ?? '',
        expectation: 'A friendly short summary of Hashbrown suitable for UI chat.',
        rubric: 'Should be concise (<=40 words) and approachable.',
        fallbackAssertion: () => {
          expect(assistantMessage?.content?.length ?? 0).toBeGreaterThan(0);
          expect(assistantMessage?.content?.length ?? 0).toBeLessThanOrEqual(200);
        },
      });
    },
  );
});

function getLastAssistantMessage(hashbrown: Hashbrown<any, any>) {
  return hashbrown
    .messages()
    .toReversed()
    .find((message) => message.role === 'assistant') as
    | Chat.AssistantMessage<string, Chat.AnyTool>
    | undefined;
}
