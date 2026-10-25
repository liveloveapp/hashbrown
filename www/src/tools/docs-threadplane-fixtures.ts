/** Framework-specific documentation recordings. */
export type ThreadplaneMode = 'threadplane-react' | 'threadplane-angular';

/** Selects requested recordings before any public asset can be changed. */
export function selectThreadplaneModes(
  requested: string | undefined,
): ThreadplaneMode[] {
  const modes: ThreadplaneMode[] = ['threadplane-react', 'threadplane-angular'];
  const selected = requested?.split(',');
  if (selected?.some((mode) => !modes.includes(mode as ThreadplaneMode)))
    throw new Error('Unknown Threadplane recording mode');
  return modes.filter((mode) => !selected || selected.includes(mode));
}

/** Builds provider-native scripted output for the real Hashbrown adapter. */
export function createThreadplaneProviderEvents(
  text: string,
  messageId: string,
): Record<string, unknown>[] {
  const item = {
    id: messageId,
    type: 'message',
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_text', text, annotations: [] }],
  };
  const events = [
    {
      type: 'response.created',
      response: {
        id: `response-${messageId}`,
        object: 'response',
        created_at: 0,
        status: 'in_progress',
        model: 'gpt-5-mini',
        output: [],
      },
    },
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: { ...item, status: 'in_progress', content: [] },
    },
    {
      type: 'response.content_part.added',
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      part: { type: 'output_text', text: '', annotations: [] },
    },
    ...(text.match(/.{1,9}/gs) ?? []).map((delta) => ({
      type: 'response.output_text.delta',
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      delta,
    })),
    {
      type: 'response.output_text.done',
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      text,
    },
    {
      type: 'response.content_part.done',
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      part: item.content[0],
    },
    { type: 'response.output_item.done', output_index: 0, item },
    {
      type: 'response.completed',
      response: {
        id: `response-${messageId}`,
        status: 'completed',
        output: [item],
        usage: { input_tokens: 30, output_tokens: 20, total_tokens: 50 },
      },
    },
  ];
  return events.map((event, sequence_number) => ({
    ...event,
    sequence_number,
  }));
}
