import { expect, test } from 'vitest';
import {
  createThreadplaneProviderEvents,
  selectThreadplaneModes,
} from '../../src/tools/docs-threadplane-fixtures';

test('selects distinct framework recordings and rejects unknown modes', () => {
  const modes = selectThreadplaneModes(undefined);

  expect(modes).toEqual(['threadplane-react', 'threadplane-angular']);
  expect(selectThreadplaneModes('threadplane-angular')).toEqual([
    'threadplane-angular',
  ]);
  expect(() => selectThreadplaneModes('threadplane,typo')).toThrow(
    'Unknown Threadplane recording mode',
  );
});

test('creates native Responses deltas with unique message identity and a completed terminal', () => {
  const events = createThreadplaneProviderEvents(
    'Shipping information is in Help.',
    'reply-2',
  );

  expect(events[0]).toMatchObject({
    type: 'response.created',
    response: { id: 'response-reply-2', status: 'in_progress', output: [] },
  });
  expect(events[2]).toMatchObject({
    type: 'response.content_part.added',
    part: { type: 'output_text', text: '' },
  });
  expect(
    events
      .filter((event) => event.type === 'response.output_text.delta')
      .map((event) => event.delta)
      .join(''),
  ).toBe('Shipping information is in Help.');
  expect(events.at(-1)).toMatchObject({
    type: 'response.completed',
    response: { output: [{ id: 'reply-2' }] },
  });
  expect(events.some((event) => String(event.type).startsWith('RUN_'))).toBe(
    false,
  );
});
