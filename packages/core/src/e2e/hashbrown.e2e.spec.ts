/* eslint-disable @typescript-eslint/no-explicit-any */
import { fryHashbrown, s, Chat, Hashbrown, ɵui } from '..';
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
    'renders UI chat components via structured UI schema',
    async () => {
      const components = [
        {
          name: 'Card',
          description: 'Container with heading and body',
          component: () => null,
          children: [
            {
              name: 'Heading',
              description: 'Title text',
              component: () => null,
              children: 'text',
            },
            {
              name: 'Body',
              description: 'Body content',
              component: () => null,
              children: 'text',
            },
            {
              name: 'CTA',
              description: 'Call-to-action button',
              component: () => null,
              children: false,
              props: {
                label: s.string('Button label'),
              },
            },
          ],
        },
      ];

      const hashbrown = fryHashbrown({
        debounce: 0,
        apiUrl: server.url,
        model: provider.model,
        emulateStructuredOutput: provider.emulateStructuredOutputs,
        responseSchema: s.object('UI chat response', {
          ui: s.streaming.array(
            'Renderable components',
            ɵui.createComponentSchema(components as any),
          ),
        }),
        system:
          'Return a UI layout as JSON using the provided components. Prefer a Card with Heading, Body, and CTA.',
        messages: [
          {
            role: 'user',
            content: 'Create a UI card summarizing Hashbrown.',
          },
        ],
      });

      const teardown = hashbrown.sizzle();
      await waitUntilHashbrownIsSettled(hashbrown);

      const assistantMessage = getLastAssistantMessage(hashbrown);
      teardown();

      const uiContent = assistantMessage?.content as
        | { ui?: Array<{ $tag?: string; $props?: Record<string, unknown> }> }
        | undefined;

      expect(uiContent?.ui?.length).toBeGreaterThan(0);
      await expectWithOpenAIEval({
        candidate: uiContent ?? {},
        expectation:
          'A JSON UI tree that uses a Card with Heading and Body plus a CTA button.',
        rubric:
          'The UI should include a Card node with at least Heading and Body children and a CTA element.',
        fallbackAssertion: () => {
          const card = uiContent?.ui?.find((node) => node.$tag === 'Card');
          expect(card).toBeTruthy();
        },
      });
    },
  );

  test('can update options mid-session and honor the new system prompt', async () => {
    const hashbrown = fryHashbrown({
      debounce: 0,
      apiUrl: server.url,
      model: provider.model,
      system: 'Answer concisely about Hashbrown capabilities.',
      messages: [
        {
          role: 'user',
          content: 'Give me a one-sentence fact about Hashbrown.',
        },
      ],
    });

    const teardown = hashbrown.sizzle();
    await waitUntilHashbrownIsSettled(hashbrown);

    hashbrown.updateOptions({
      system: 'Respond ONLY with a 2-word slogan that mentions Hashbrown.',
    });

    hashbrown.sendMessage({
      role: 'user',
      content: 'Share the slogan now.',
    });

    await waitUntilHashbrownIsSettled(hashbrown);
    const assistantMessage = getLastAssistantMessage(hashbrown);
    teardown();

    await expectWithOpenAIEval({
      candidate: assistantMessage?.content ?? '',
      expectation: 'A two-word slogan referencing Hashbrown.',
      rubric: 'Must be exactly two words and include the name Hashbrown.',
      fallbackAssertion: () => {
        const words = (assistantMessage?.content ?? '')
          .toString()
          .trim()
          .split(/\s+/);
        expect(words.length).toBeLessThanOrEqual(4);
        expect(words.join(' ').toLowerCase()).toContain('hashbrown');
      },
    });
  });
});

function getLastAssistantMessage(hashbrown: Hashbrown<any, any>) {
  return hashbrown
    .messages()
    .toReversed()
    .find((message) => message.role === 'assistant') as
    | Chat.AssistantMessage<string, Chat.AnyTool>
    | undefined;
}
