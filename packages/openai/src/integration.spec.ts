import {} from 'dotenv';
import { Chat, s } from '@hashbrownai/core';
import { HashbrownOpenAI } from './index';

const OPENAI_API_KEY = process.env['OPENAI_API_KEY'] ?? '';
const OPENAI_MODEL = (process.env['OPENAI_MODEL'] ??
  'gpt-4.1-mini') as Chat.Api.CompletionCreateParams['model'];

jest.setTimeout(60_000);

test('OpenAI Text Streaming', async () => {
  const request: Chat.Api.CompletionCreateParams = {
    operation: 'generate',
    model: OPENAI_MODEL,
    system: `
     I am writing an integration test against OpenAI. Respond
     exactly with the text "Hello, world!"

     DO NOT respond with any other text.

     # Examples
     User: "Please respond with the correct text"
     Assistant: "Hello, world!"

    `,
    messages: [
      {
        role: 'user',
        content: 'Please respond with the correct text.',
      },
    ],
  };

  const frames = await collectFrames(
    HashbrownOpenAI.stream.text({
      apiKey: OPENAI_API_KEY,
      request,
    }),
  );

  const responseText = extractText(frames);

  expect(responseText).toBe('Hello, world!');
  expect(frames.some((frame) => frame.type === 'response.created')).toBe(true);
  expect(frames.some((frame) => frame.type === 'response.completed')).toBe(
    true,
  );
});

test('OpenAI Tool Calling', async () => {
  const request: Chat.Api.CompletionCreateParams = {
    operation: 'generate',
    model: OPENAI_MODEL,
    system: `
     I am writing an integration test against OpenAI. Call
     the "test" tool with the argument "Hello, world!"

     DO NOT respond with any other text.
    `,
    messages: [
      {
        role: 'user',
        content: 'Please call the test tool and respond with the text.',
      },
    ],
    tools: [
      {
        name: 'test',
        description: 'Test tool',
        parameters: s.toJsonSchema(
          s.object('args', {
            text: s.string(''),
          }),
        ),
      },
    ],
    toolChoice: 'required',
  };

  const frames = await collectFrames(
    HashbrownOpenAI.stream.text({
      apiKey: OPENAI_API_KEY,
      request,
    }),
  );

  const toolCalls = extractToolCalls(frames);
  const firstToolCall = toolCalls[0];
  const parsedArgs = firstToolCall ? JSON.parse(firstToolCall.arguments) : null;

  expect(firstToolCall?.name).toBe('test');
  expect(parsedArgs).toEqual({ text: 'Hello, world!' });
  expect(frames.some((frame) => frame.type === 'response.completed')).toBe(
    true,
  );
});

test('OpenAI with structured output', async () => {
  const request: Chat.Api.CompletionCreateParams = {
    operation: 'generate',
    model: OPENAI_MODEL,
    system: `
     I am writing an integration test against OpenAI. Respond
     exactly with the text "Hello, world!" in JSON format.
    `,
    messages: [
      {
        role: 'user',
        content: 'Please respond with the correct text.',
      },
    ],
    responseFormat: s.toJsonSchema(
      s.object('response', {
        text: s.string(''),
      }),
    ),
  };

  const frames = await collectFrames(
    HashbrownOpenAI.stream.text({
      apiKey: OPENAI_API_KEY,
      request,
    }),
  );

  const responseText = extractText(frames);
  const parsed = JSON.parse(responseText);

  expect(parsed).toEqual({ text: 'Hello, world!' });
});

test('OpenAI with tool calling and structured output', async () => {
  const request: Chat.Api.CompletionCreateParams = {
    operation: 'generate',
    model: OPENAI_MODEL,
    system: `
        You must call the "test" tool with the argument "Hello, world!".
        After the tool returns, respond only with its text in JSON { "text": "<value>" }.
      `,
    messages: [
      {
        role: 'user',
        content: 'Please call the test tool and respond with the text.',
      },
    ],
    tools: [
      {
        name: 'test',
        description: 'Test tool',
        parameters: s.toJsonSchema(
          s.object('args', {
            text: s.string(''),
          }),
        ),
      },
    ],
    toolChoice: 'required',
    responseFormat: s.toJsonSchema(
      s.object('response', {
        text: s.string(''),
      }),
    ),
  };

  const frames = await collectFrames(
    HashbrownOpenAI.stream.text({
      apiKey: OPENAI_API_KEY,
      request,
    }),
  );

  const toolCalls = extractToolCalls(frames);
  const firstToolCall = toolCalls[0];
  const responseText = extractText(frames);
  const parsed = JSON.parse(responseText);

  expect(firstToolCall?.name).toBe('test');
  expect(parsed).toEqual({ text: 'Hello, world!' });
});

type OpenResponsesFrame =
  | {
      type: 'response.created' | 'response.in_progress' | 'response.completed';
      response: Record<string, unknown>;
    }
  | {
      type: 'response.output_item.added' | 'response.output_item.done';
      outputIndex: number;
      item: Record<string, unknown> | null;
    }
  | {
      type: 'response.output_text.delta';
      itemId: string;
      outputIndex: number;
      contentIndex: number;
      delta: string;
    }
  | {
      type: 'response.output_text.done';
      itemId: string;
      outputIndex: number;
      contentIndex: number;
      text: string;
    }
  | {
      type: 'response.function_call_arguments.delta';
      itemId: string;
      outputIndex: number;
      delta: string;
    }
  | {
      type: 'response.function_call_arguments.done';
      itemId: string;
      outputIndex: number;
      arguments: string;
    }
  | {
      type: 'error';
      error: {
        type: string;
        message: string;
      };
    };

type ToolCallSummary = {
  itemId: string;
  name?: string;
  arguments: string;
};

async function collectFrames(
  iterator: AsyncIterable<Uint8Array>,
): Promise<OpenResponsesFrame[]> {
  const decoder = new TextDecoder();
  let buffer = new Uint8Array(0);
  const frames: OpenResponsesFrame[] = [];

  for await (const chunk of iterator) {
    const next = new Uint8Array(buffer.length + chunk.length);
    next.set(buffer);
    next.set(chunk, buffer.length);
    buffer = next;

    let offset = 0;
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );

    while (buffer.length - offset >= 4) {
      const length = view.getUint32(offset, false);

      if (buffer.length - offset < 4 + length) {
        break;
      }

      const start = offset + 4;
      const end = start + length;
      const json = decoder.decode(buffer.subarray(start, end));
      frames.push(JSON.parse(json) as OpenResponsesFrame);
      offset = end;
    }

    if (offset > 0) {
      buffer = buffer.subarray(offset);
    }
  }

  if (buffer.length > 0) {
    throw new Error(`Stream ended with ${buffer.length} leftover bytes`);
  }

  return frames;
}

function extractText(frames: OpenResponsesFrame[]): string {
  const deltas: string[] = [];
  let doneText: string | undefined;

  for (const frame of frames) {
    if (frame.type === 'response.output_text.delta') {
      deltas.push(frame.delta);
    }
    if (frame.type === 'response.output_text.done') {
      doneText = frame.text;
    }
  }

  return doneText ?? deltas.join('');
}

function extractToolCalls(frames: OpenResponsesFrame[]): ToolCallSummary[] {
  const toolCalls = new Map<string, ToolCallSummary>();

  for (const frame of frames) {
    if (frame.type === 'response.output_item.added' && frame.item) {
      const item = frame.item as { id?: string; name?: string; type?: string };
      if (item.type === 'function_call' && item.id) {
        toolCalls.set(item.id, {
          itemId: item.id,
          name: item.name,
          arguments: '',
        });
      }
    }

    if (frame.type === 'response.function_call_arguments.delta') {
      const existing = toolCalls.get(frame.itemId);
      if (existing) {
        existing.arguments = `${existing.arguments}${frame.delta}`;
      } else {
        toolCalls.set(frame.itemId, {
          itemId: frame.itemId,
          arguments: frame.delta,
        });
      }
    }

    if (frame.type === 'response.function_call_arguments.done') {
      const existing = toolCalls.get(frame.itemId);
      if (existing) {
        existing.arguments = frame.arguments;
      } else {
        toolCalls.set(frame.itemId, {
          itemId: frame.itemId,
          arguments: frame.arguments,
        });
      }
    }

    if (frame.type === 'error') {
      throw new Error(`${frame.error.type}: ${frame.error.message}`);
    }
  }

  return Array.from(toolCalls.values());
}
