import { EventType } from '@ag-ui/core';
import { apiActions, devActions, internalActions } from '../actions';
import { lowerViewMessagesToAgUi } from './ag-ui-message-history';
import {
  initialAgentState,
  reducer,
  ɵselectCommittedAgentState,
  ɵselectProtocolError,
  ɵselectStateWriteLocked,
  ɵselectVisibleAgentState,
} from './agent-state.reducer';

const canonicalUser = (content: string) =>
  lowerViewMessagesToAgUi([{ role: 'user', content }], {
    createId: () => `user-${content}`,
  });

function beginAttempt(state = initialAgentState) {
  return reducer(state, internalActions.generationAttemptStarted());
}

function snapshot(state: ReturnType<typeof beginAttempt>, value: unknown) {
  return reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.STATE_SNAPSHOT,
      snapshot: value,
    }),
  );
}

test('initializes committed state without cloning its already-owned value', () => {
  const state = Object.freeze({ count: 1 });

  const result = reducer(
    initialAgentState,
    devActions.init({ canonicalMessages: [], system: 'test', state }),
  );

  expect(result).toEqual({
    committed: state,
    draft: undefined,
    attemptActive: false,
    stateWriteLocked: false,
    protocolError: undefined,
  });
  expect(result.committed).toBe(state);
  expect(Object.isFrozen(result.committed)).toBe(true);
});

test('locks initial state writes when initialization ends with a user message', () => {
  const result = reducer(
    initialAgentState,
    devActions.init({
      canonicalMessages: [],
      system: 'test',
      messages: [{ role: 'user', content: 'Start' }],
    }),
  );

  expect(result.stateWriteLocked).toBe(true);
});

test('updates only committed state for an unlocked local write', () => {
  const previous = Object.freeze({ count: 1 });
  const next = Object.freeze({ count: 2 });
  const state = reducer(
    initialAgentState,
    devActions.init({ canonicalMessages: [], system: 'test', state: previous }),
  );

  const result = reducer(state, devActions.setState({ state: next }));

  expect(result.committed).toBe(next);
  expect(result.draft).toBeUndefined();
  expect(result.committed).not.toBe(previous);
});

test('ignores a local write that reaches the reducer while writes are locked', () => {
  const committed = Object.freeze({ count: 1 });
  const proposed = Object.freeze({ count: 2 });
  const state = reducer(
    initialAgentState,
    devActions.init({
      canonicalMessages: [],
      system: 'test',
      state: committed,
      messages: [{ role: 'user', content: 'Start' }],
    }),
  );

  const result = reducer(state, devActions.setState({ state: proposed }));

  expect(result).toBe(state);
});

test('copies committed state into an active attempt draft', () => {
  const committed = Object.freeze({ count: 1 });
  const state = reducer(
    initialAgentState,
    devActions.init({
      canonicalMessages: [],
      system: 'test',
      state: committed,
    }),
  );

  const result = beginAttempt(state);

  expect(result.draft).toBe(committed);
  expect(result.attemptActive).toBe(true);
});

test('owns and freezes a live state snapshot', () => {
  const eventSnapshot = { count: 2, nested: { enabled: true } };

  const result = snapshot(beginAttempt(), eventSnapshot);

  expect(result.draft).toEqual(eventSnapshot);
  expect(result.draft).not.toBe(eventSnapshot);
  expect(Object.isFrozen(result.draft)).toBe(true);
  expect(Object.isFrozen((result.draft as { nested: object }).nested)).toBe(
    true,
  );
});

test('applies a live state delta to the active draft', () => {
  const state = snapshot(beginAttempt(), { count: 1, values: ['a'] });

  const result = reducer(
    state,
    apiActions.generateMessageEvent({
      type: EventType.STATE_DELTA,
      delta: [
        { op: 'replace', path: '/count', value: 2 },
        { op: 'add', path: '/values/-', value: 'b' },
      ],
    }),
  );

  expect(result.draft).toEqual({ count: 2, values: ['a', 'b'] });
  expect(Object.isFrozen(result.draft)).toBe(true);
});

test('commits the current draft on generation success', () => {
  const draft = snapshot(beginAttempt(), { count: 2 });
  const locked = { ...draft, stateWriteLocked: true };

  const result = reducer(
    locked,
    apiActions.generateMessageSuccess({
      message: { role: 'assistant', content: '', toolCallIds: [] },
      toolCalls: [],
    }),
  );

  expect(result).toEqual({
    committed: draft.draft,
    draft: draft.draft,
    attemptActive: false,
    stateWriteLocked: true,
    protocolError: undefined,
  });
});

test('does not overwrite committed state when success arrives without an active attempt', () => {
  const committed = Object.freeze({ count: 1 });
  const state = {
    ...initialAgentState,
    committed,
    draft: Object.freeze({ count: 2 }),
    stateWriteLocked: true,
  };

  const result = reducer(
    state,
    apiActions.generateMessageSuccess({
      message: { role: 'assistant', content: '', toolCallIds: [] },
      toolCalls: [],
    }),
  );

  expect(result.committed).toBe(committed);
  expect(result.stateWriteLocked).toBe(true);
});

test('rolls back an active draft without releasing the write lock', () => {
  const committed = Object.freeze({ count: 1 });
  const attempted = snapshot(
    beginAttempt({
      ...initialAgentState,
      committed,
      stateWriteLocked: true,
    }),
    { count: 2 },
  );

  const result = reducer(
    attempted,
    internalActions.generationAttemptRolledBack(),
  );

  expect(result).toEqual({
    committed,
    draft: committed,
    attemptActive: false,
    stateWriteLocked: true,
    protocolError: undefined,
  });
});

test('retains the previous draft when a state snapshot is invalid', () => {
  const validDraft = snapshot(beginAttempt(), { count: 1 });

  const result = snapshot(validDraft, { count: Number.NaN });

  expect(result.committed).toBeUndefined();
  expect(result.draft).toBe(validDraft.draft);
  expect(result.protocolError).toBeInstanceOf(Error);
});

test('retains the previous draft when a state delta is invalid', () => {
  const validDraft = snapshot(beginAttempt(), { count: 1 });

  const result = reducer(
    validDraft,
    apiActions.generateMessageEvent({
      type: EventType.STATE_DELTA,
      delta: [{ op: 'remove', path: '/missing' }],
    }),
  );

  expect(result.committed).toBeUndefined();
  expect(result.draft).toBe(validDraft.draft);
  expect(result.protocolError).toBeInstanceOf(Error);
});

test('retains the previous draft when a state delta is malformed', () => {
  const validDraft = snapshot(beginAttempt(), { count: 1 });
  const malformedEvent = {
    type: EventType.STATE_DELTA,
    delta: {},
  } as never;

  const result = reducer(
    validDraft,
    apiActions.generateMessageEvent(malformedEvent),
  );

  expect(result.draft).toBe(validDraft.draft);
  expect(result.protocolError).toBeInstanceOf(Error);
});

test.each([
  [
    'sendMessage',
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Next'),
      message: { role: 'user', content: 'Next' },
    }),
  ],
  [
    'setMessages',
    devActions.setMessages({
      canonicalMessages: [],
      messages: [{ role: 'user', content: 'Next' }],
    }),
  ],
  ['resendMessages', devActions.resendMessages()],
])(
  '%s abandons an active draft and starts a locked logical generation',
  (_, action) => {
    const committed = Object.freeze({ count: 1 });
    const active = snapshot(
      beginAttempt({
        ...initialAgentState,
        committed,
        stateWriteLocked: true,
      }),
      { count: 2 },
    );

    const superseded = reducer(active, action);
    const afterOldRollback = reducer(
      superseded,
      internalActions.generationAttemptRolledBack(),
    );

    expect(superseded).toEqual({
      committed,
      draft: committed,
      attemptActive: false,
      stateWriteLocked: true,
      protocolError: undefined,
    });
    expect(afterOldRollback).toBe(superseded);
  },
);

test('matching logical settlement releases the logical-generation write lock', () => {
  const locked = { ...initialAgentState, stateWriteLocked: true };

  const result = reducer(
    locked,
    internalActions.logicalGenerationSettled({ generationId: 'generation-1' }),
  );

  expect(result.stateWriteLocked).toBe(false);
  expect(result.committed).toBeUndefined();
});

test.each([
  [
    'generation success',
    apiActions.generateMessageSuccess({
      message: { role: 'assistant', content: '', toolCallIds: [] },
      toolCalls: [],
    }),
  ],
  [
    'terminal generation error',
    apiActions.generateMessageError(new Error('failed')),
  ],
  ['stop', devActions.stopMessageGeneration(false)],
  ['silent retirement', internalActions.generationSilentlyRetired()],
])(
  '%s preserves the logical-generation write lock until settlement',
  (_, action) => {
    const locked = { ...initialAgentState, stateWriteLocked: true };

    const result = reducer(locked, action);

    expect(result.stateWriteLocked).toBe(true);
  },
);

test('tool continuation locks state writes while a normal stopped tool turn leaves them released', () => {
  const continued = reducer(
    initialAgentState,
    internalActions.toolTurnSettled({
      generationId: 'generation-1',
      toolTurnId: 'tool-turn-1',
      continuation: 'continue',
      toolCalls: [],
      toolMessages: [],
      canonicalMessages: [],
    }),
  );
  const stopped = reducer(
    initialAgentState,
    internalActions.toolTurnSettled({
      generationId: 'generation-1',
      toolTurnId: 'tool-turn-1',
      continuation: 'stop',
      toolCalls: [],
      toolMessages: [],
      canonicalMessages: [],
    }),
  );

  expect(continued.stateWriteLocked).toBe(true);
  expect(stopped.stateWriteLocked).toBe(false);
});

test('a stale stopped tool settlement preserves a superseding generation lock', () => {
  const supersedingGeneration = reducer(
    initialAgentState,
    devActions.sendMessage({
      canonicalMessages: canonicalUser('Start a replacement generation'),
      message: { role: 'user', content: 'Start a replacement generation' },
    }),
  );

  const result = reducer(
    supersedingGeneration,
    internalActions.toolTurnSettled({
      generationId: 'generation-1',
      toolTurnId: 'tool-turn-1',
      continuation: 'stop',
      toolCalls: [],
      toolMessages: [],
      canonicalMessages: [],
    }),
  );

  expect(result.stateWriteLocked).toBe(true);
});

test('exposes committed, visible, lock, and protocol-error selectors', () => {
  const committed = Object.freeze({ count: 1 });
  const active = snapshot(beginAttempt({ ...initialAgentState, committed }), {
    count: 2,
  });
  const invalid = snapshot(active, { count: Number.NaN });

  expect(ɵselectCommittedAgentState(invalid)).toBe(committed);
  expect(ɵselectVisibleAgentState(invalid)).toBe(active.draft);
  expect(ɵselectStateWriteLocked(invalid)).toBe(false);
  expect(ɵselectProtocolError(invalid)).toBeInstanceOf(Error);
});
