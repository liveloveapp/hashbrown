import { expect } from '@playwright/test';
import type { ModelApi } from './browser-fixture';
import type { ModelRequest } from './http-fixture';

/** Requires a bounded complete successful SSE protocol run independently from HTTP EOF. */
export function expectNativeRunCapture(capture: {
  readonly body: string;
  readonly truncated: boolean;
}) {
  expect(capture.truncated).toBe(false);
  expect(capture.body).toMatch(/\r?\n\r?\n$/);
  const events = capture.body
    .split(/\r?\n\r?\n/)
    .filter((frame) => frame.trim().length > 0)
    .map((frame) => {
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      return JSON.parse(data) as Record<string, unknown>;
    });
  expect(events[0]?.type).toBe('RUN_STARTED');
  const terminals = events.filter(
    (event) => event.type === 'RUN_FINISHED' || event.type === 'RUN_ERROR',
  );
  expect(terminals).toHaveLength(1);
  expect(events.at(-1)).toBe(terminals[0]);
  expect(terminals[0]?.type).toBe('RUN_FINISHED');
  return events;
}

/** Original function call and output expected in the native model transcript. */
export interface NativeToolPair {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
  readonly output: string;
}

/** Reads the explicitly selected native transcript without normalizing its items. */
export function nativeHistory(request: ModelRequest, api: ModelApi) {
  const key = api === 'responses' ? 'input' : 'messages';
  expect(request.body).toHaveProperty(key);
  expect(Array.isArray(request.body[key])).toBe(true);
  return request.body[key] as Record<string, unknown>[];
}

/** Asserts exact function IDs, original arguments and outputs, each appearing once. */
export function expectNativeToolPairs(
  request: ModelRequest,
  api: ModelApi,
  calls: readonly NativeToolPair[],
) {
  const history = nativeHistory(request, api);
  if (api === 'responses') {
    expect(history.filter((item) => item.type === 'function_call')).toEqual(
      calls.map((call) =>
        expect.objectContaining({
          call_id: call.id,
          name: call.name,
          arguments: expect.any(String),
        }),
      ),
    );
    history
      .filter((item) => item.type === 'function_call')
      .forEach((item, index) => {
        expect(JSON.parse(item.arguments as string)).toEqual(
          JSON.parse(calls[index].arguments),
        );
      });
    expect(
      history.filter((item) => item.type === 'function_call_output'),
    ).toEqual(
      calls.map((call) =>
        expect.objectContaining({ call_id: call.id, output: call.output }),
      ),
    );
    expect(request.body.store).toBe(false);
    expect(request.body).not.toHaveProperty('previous_response_id');
    expect(request.body).not.toHaveProperty('conversation');
  } else {
    expect(history.flatMap((message) => message.tool_calls ?? [])).toEqual(
      calls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: expect.any(String) },
      })),
    );
    history
      .flatMap((message) => message.tool_calls ?? [])
      .forEach((value, index) => {
        const item = value as { function: { arguments: string } };
        expect(JSON.parse(item.function.arguments)).toEqual(
          JSON.parse(calls[index].arguments),
        );
      });
    expect(history.filter((message) => message.role === 'tool')).toEqual(
      calls.map((call) =>
        expect.objectContaining({
          tool_call_id: call.id,
          content: call.output,
        }),
      ),
    );
  }
}

/** Requires the complete original strict schema in the selected API's native field. */
export function expectNativeSchema(
  request: ModelRequest,
  api: ModelApi,
  schema: unknown,
) {
  if (api === 'responses') {
    expect(request.body.text).toEqual({
      format: { type: 'json_schema', name: 'hashbrown', schema, strict: true },
    });
    expect(request.body).not.toHaveProperty('response_format');
  } else {
    expect(request.body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'hashbrown', schema, strict: true },
    });
    expect(request.body).not.toHaveProperty('text.format');
  }
}
