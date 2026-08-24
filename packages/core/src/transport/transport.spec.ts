import { type AGUIEvent, EventType, type RunAgentInput } from '@ag-ui/core';
import type {
  Transport,
  TransportRequest,
  TransportResponse,
} from './transport';

const input: RunAgentInput & {
  hashbrown?: { responseSchema?: object; ui?: boolean };
} = {
  threadId: 'thread-1',
  runId: 'run-1',
  messages: [],
  tools: [],
  context: [],
  state: {},
  forwardedProps: {},
};

const events = async function* (): AsyncGenerator<AGUIEvent> {
  yield {
    type: EventType.RUN_STARTED,
    threadId: input.threadId,
    runId: input.runId,
  };
};

const request: TransportRequest = {
  input,
  signal: new AbortController().signal,
  attempt: 1,
  maxAttempts: 1,
  requestId: 'request-1',
};

const response: TransportResponse = {
  events: events(),
};

const transport: Transport = {
  name: 'test',
  async send() {
    return response;
  },
};

// @ts-expect-error Transport requests require AG-UI input.
const missingInput: TransportRequest = {
  signal: request.signal,
  attempt: request.attempt,
  maxAttempts: request.maxAttempts,
  requestId: request.requestId,
};

// @ts-expect-error Transport responses require AG-UI events.
const missingEvents: TransportResponse = {};

test('characterizes the event-only transport contract', () => {
  const removedMembers = [
    // @ts-expect-error Completion parameters are not transport input.
    request.params,
    // @ts-expect-error Byte streams are not transport responses.
    response.stream,
    // @ts-expect-error Frame generators are not transport responses.
    response.frames,
    // @ts-expect-error Thread-loading capability is not part of Transport.
    transport.supportsLegacyThreadLoading,
  ];

  expect({ request, response, transport, missingInput, missingEvents }).toEqual(
    expect.any(Object),
  );
  expect(removedMembers).toEqual([undefined, undefined, undefined, undefined]);
});
