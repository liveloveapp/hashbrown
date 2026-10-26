/** The public scripted provider output used by the documentation recorder. */
export const supportReply =
  'Your Studio plan includes a response within one business day.';

/** Builds provider-native Responses events; the real adapter owns AG-UI mapping. */
export function createSupportProviderEvents(
  text = supportReply,
): Record<string, unknown>[] {
  const item = {
    id: 'support-message',
    type: 'message',
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_text', text, annotations: [] }],
  };
  const events = [
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: { ...item, status: 'in_progress', content: [] },
    },
    ...(text.match(/.{1,10}/gs) ?? []).map((delta) => ({
      type: 'response.output_text.delta',
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      delta,
    })),
    { type: 'response.output_item.done', output_index: 0, item },
    {
      type: 'response.completed',
      response: {
        id: 'support-response',
        status: 'completed',
        output: [item],
        usage: { input_tokens: 20, output_tokens: 15, total_tokens: 35 },
      },
    },
  ];
  return events.map((event, sequence_number) => ({
    ...event,
    sequence_number,
  }));
}
