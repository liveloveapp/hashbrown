import { type AGUIEvent, EventType } from '@ag-ui/core';
import { text } from './text.fn';

/** Exercises the real SDK accumulator with a controlled HTTP event stream. */
async function runResponse(response: Record<string, unknown>) {
  const events = [
    {
      type: 'response.created',
      sequence_number: 0,
      response: { status: 'in_progress', output: [] },
    },
    {
      type:
        response['status'] === 'incomplete'
          ? 'response.incomplete'
          : 'response.completed',
      sequence_number: 1,
      response,
    },
  ];
  const fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(
        events
          .map(
            (event) =>
              `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
          )
          .join(''),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );

  try {
    return await Array.fromAsync(
      text({
        apiKey: 'test-api-key',
        baseURL: 'https://openai.test/v1',
        model: 'qwen2.5:14b',
        input: {
          threadId: 'thread',
          runId: 'run',
          messages: [{ id: 'user', role: 'user', content: 'Call lookup.' }],
          tools: [],
          context: [],
          state: {},
          forwardedProps: {},
        },
      }),
    );
  } finally {
    fetchSpy.mockRestore();
  }
}

test.each([null, undefined])(
  'rejects a completed HTTP response with malformed output %p',
  async (output) => {
    // Ollama 0.35 reports completed with output:null after exhausting a
    // five-token tool request. Its missing incomplete_details cannot establish
    // a length finish; the malformed response must remain an error.
    const response = {
      status: 'completed',
      output,
      incomplete_details: null,
      model: 'qwen2.5:14b',
      usage: { input_tokens: 175, output_tokens: 5, total_tokens: 180 },
    };

    const events: AGUIEvent[] = await runResponse(response);

    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.RUN_ERROR,
    ]);
  },
);

test('preserves the length finish for a valid empty incomplete HTTP response', async () => {
  const response = {
    status: 'incomplete',
    output: [],
    incomplete_details: { reason: 'max_output_tokens' },
    model: 'qwen2.5:14b',
    usage: { input_tokens: 175, output_tokens: 5, total_tokens: 180 },
  };

  const events = await runResponse(response);

  expect(events.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.RUN_FINISHED,
  ]);
  expect(events.at(-1)).toMatchObject({
    metadata: {
      hashbrown: { finishReason: 'length' },
      openai: { status: 'incomplete', incompleteReason: 'max_output_tokens' },
    },
  });
});
