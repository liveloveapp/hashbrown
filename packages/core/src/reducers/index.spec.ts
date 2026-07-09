import { apiActions, devActions } from '../actions';
import { Chat } from '../models';
import { s } from '../schema';
import { reducers, selectViewMessages } from './index';

const initAction = { type: '@@init' } as const;

function createState() {
  return {
    config: reducers.config(undefined, initAction),
    messages: reducers.messages(undefined, initAction),
    status: reducers.status(undefined, initAction),
    streamingMessage: reducers.streamingMessage(undefined, initAction),
    toolCalls: reducers.toolCalls(undefined, initAction),
    tools: reducers.tools(undefined, initAction),
    thread: reducers.thread(undefined, initAction),
  };
}

function reduceAll(
  state: ReturnType<typeof createState>,
  action: { type: string },
) {
  return {
    config: reducers.config(state.config, action),
    messages: reducers.messages(state.messages, action),
    status: reducers.status(state.status, action),
    streamingMessage: reducers.streamingMessage(state.streamingMessage, action),
    toolCalls: reducers.toolCalls(state.toolCalls, action),
    tools: reducers.tools(state.tools, action),
    thread: reducers.thread(state.thread, action),
  };
}

test('selectViewMessages uses output tool arguments in emulated mode', () => {
  const responseSchema = s.object('output', { text: s.string('text') });

  let state = createState();

  state = reduceAll(
    state,
    devActions.init({
      model: 'test-model',
      system: 'test',
      responseSchema,
      emulateStructuredOutput: true,
    }),
  );

  const outputToolCall: Chat.Internal.ToolCall = {
    id: 'call-output',
    name: 'output',
    arguments: '{"text":"hello"}',
    argumentsResolved: { text: 'hello' },
    status: 'pending',
  };

  const assistantMessage: Chat.Internal.AssistantMessage = {
    role: 'assistant',
    content: '',
    toolCallIds: [outputToolCall.id],
  };

  state = reduceAll(
    state,
    apiActions.generateMessageSuccess({
      message: assistantMessage,
      toolCalls: [outputToolCall],
    }),
  );

  const messages = selectViewMessages(state);
  const assistant = messages.find((message) => message.role === 'assistant');

  expect(assistant?.content).toEqual({ text: 'hello' });
});

test('selectViewMessages uses streaming output tool arguments', () => {
  const responseSchema = s.object('output', {
    text: s.streaming.string('text'),
  });
  const toolsByName: Record<string, Chat.Internal.Tool> = {
    output: {
      name: 'output',
      description: '',
      schema: responseSchema,
      handler: async () => undefined,
    },
  };

  let state = createState();

  state = reduceAll(
    state,
    devActions.init({
      model: 'test-model',
      system: 'test',
      responseSchema,
      emulateStructuredOutput: true,
    }),
  );

  state = reduceAll(
    state,
    apiActions.generateMessageStart({
      responseSchema,
      emulateStructuredOutput: true,
      toolsByName,
    }),
  );

  state = reduceAll(
    state,
    apiActions.generateMessageChunk({
      choices: [
        {
          index: 0,
          delta: {
            role: 'assistant',
            toolCalls: [
              {
                index: 0,
                id: 'call-output',
                type: 'function',
                function: { name: 'output', arguments: '{"text":"he' },
              },
            ],
          },
          finishReason: null,
        },
      ],
    }),
  );

  state = reduceAll(
    state,
    apiActions.generateMessageChunk({
      choices: [
        {
          index: 0,
          delta: {
            toolCalls: [
              {
                index: 0,
                function: { arguments: 'llo"}' },
              },
            ],
          },
          finishReason: null,
        },
      ],
    }),
  );

  const messages = selectViewMessages(state);
  const assistant = messages.find((message) => message.role === 'assistant');

  expect(assistant?.content).toEqual({ text: 'hello' });
});
