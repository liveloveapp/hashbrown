import { expect, test } from 'vitest';
import {
  latestAssistantText,
  proseState,
} from '../../examples/quickstart/runtime/prose';

test('renders only the latest assistant string, including an empty replacement', () => {
  const messages = [
    { role: 'assistant', content: 'Previous reply' },
    { role: 'user', content: 'Generate again' },
    { role: 'assistant', content: '' },
  ];

  const result = latestAssistantText(messages);

  expect(result).toBe('');
  expect(latestAssistantText([{ role: 'user', content: 'Generate' }])).toBe('');
  expect(
    latestAssistantText([{ role: 'assistant', content: '## Packing' }]),
  ).toBe('## Packing');
});

test('does not finalize parsing during the send debounce or receiving phase', () => {
  const base = {
    started: true,
    stopped: false,
    error: undefined,
    isLoading: false,
    isSending: false,
    isReceiving: false,
    isGenerating: false,
  };

  const states = [
    proseState({ ...base, isSending: true }),
    proseState({ ...base, isReceiving: true }),
    proseState({ ...base, isGenerating: true }),
  ];

  for (const state of states) {
    expect(state.busy).toBe(true);
    expect(state.isComplete).toBe(false);
    expect(state.status).toBe('Generating reply…');
  }
});

test('finalizes ended streams while distinguishing success, cancel and error', () => {
  const base = {
    started: true,
    stopped: false,
    error: undefined,
    isLoading: false,
    isSending: false,
    isReceiving: false,
    isGenerating: false,
  };

  const completed = proseState(base);
  const stopped = proseState({ ...base, stopped: true });
  const failed = proseState({ ...base, error: new Error('offline') });
  const ready = proseState({ ...base, started: false });

  expect(completed).toEqual({
    busy: false,
    isComplete: true,
    status: 'Reply complete.',
  });
  expect(stopped.isComplete).toBe(true);
  expect(stopped.status).toBe(
    'Stopped. Generate another reply to start again.',
  );
  expect(failed.isComplete).toBe(true);
  expect(failed.status).toBe(
    'Request failed. Generate another reply to try again.',
  );
  expect(ready.status).toBe('Ready');
});

test('does not label a truncated or refused run as a complete reply', () => {
  const base = {
    started: true,
    stopped: false,
    error: undefined,
    isLoading: false,
    isSending: false,
    isReceiving: false,
    isGenerating: false,
  };

  const states = (
    ['length', 'content_filter', 'refusal', 'other', 'tool_calls'] as const
  ).map((finishReason) => proseState({ ...base, finishReason }));

  for (const state of states) {
    expect(state.isComplete).toBe(true);
    expect(state.status).toBe('Reply ended early. Generate another reply.');
  }
});
