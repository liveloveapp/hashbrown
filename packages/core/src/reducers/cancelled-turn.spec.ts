import { EventType, type Message } from '@ag-ui/core';
import { ɵCANCELLED_TURN_METADATA_KEY } from '../models/cancelled-turn';
import { apiActions, devActions, internalActions } from '../actions';
import { createCanonicalRunAgentInput } from '../transport/hashbrown-run-agent-input';
import { createStore } from '../utils/micro-ngrx';
import { s } from '../schema';
import {
  reducers,
  selectMessages,
  selectRawStreamingMessage,
  selectViewMessages,
  ɵprepareRootAction,
  ɵselectCommittedAgUiMessages,
  ɵselectVisibleAgUiMessages,
} from './index';
import {
  projectAgUiMessages,
  ɵreconcileAgUiMessageProjection,
} from './ag-ui-message-history';

function setup() {
  const store = createStore({
    reducers,
    effects: [],
    prepareAction: ɵprepareRootAction,
  });
  store.dispatch(
    devActions.init({
      system: '',
      messages: [{ role: 'user', content: 'Original exact request.' }],
      canonicalMessages: [
        { id: 'u1', role: 'user', content: 'Original exact request.' },
      ],
    }),
  );
  store.dispatch(
    internalActions.logicalGenerationStarted({ generationId: 'g1' }),
  );
  return store;
}

function cancel(
  store: ReturnType<typeof setup>,
  beforeMessageId?: string,
  generationId = 'g1',
) {
  store.dispatch(
    internalActions.generationCancelled({
      generationId,
      markerId: 'cancel-g1',
      reason: beforeMessageId ? 'superseded' : 'stopped',
      beforeMessageId,
    }),
  );
}

test('cancellation keeps exact history and hides an immutable deduplicated marker from schema projections', () => {
  const store = setup();

  cancel(store);
  const history = store.read(ɵselectCommittedAgUiMessages);
  cancel(store);

  expect(history).toHaveLength(2);
  expect(history[0]).toEqual({
    id: 'u1',
    role: 'user',
    content: 'Original exact request.',
  });
  expect(history[1]).toMatchObject({
    id: 'cancel-g1',
    role: 'assistant',
    content: expect.stringContaining('cancelled'),
  });
  expect(Object.isFrozen(history[1])).toBe(true);
  expect(store.read(ɵselectCommittedAgUiMessages)).toBe(history);
  expect(store.read(selectMessages)).toHaveLength(1);
  const schema = s.object('Result', { text: s.string('Text') });
  expect(projectAgUiMessages(history, {}, schema).messages).toHaveLength(1);
  expect(
    ɵreconcileAgUiMessageProjection(undefined, history, {}, schema).projection
      .messages,
  ).toHaveLength(1);
});

test('cancellation rejects stale ownership and missing exact anchors and inserts before replacement', () => {
  const store = setup();
  const original = store.read(ɵselectCommittedAgUiMessages);

  cancel(store, undefined, 'stale');
  cancel(store, 'missing');

  expect(store.read(ɵselectCommittedAgUiMessages)).toBe(original);
  store.dispatch(
    devActions.sendMessage({
      message: { role: 'user', content: 'Replacement' },
      canonicalMessages: [{ id: 'u2', role: 'user', content: 'Replacement' }],
    }),
  );
  cancel(store, 'u2');

  expect(
    store.read(ɵselectCommittedAgUiMessages).map((message) => message.id),
  ).toEqual(['u1', 'cancel-g1', 'u2']);
  expect(store.read(ɵselectCommittedAgUiMessages)[1]).toMatchObject({
    content: expect.stringContaining('replaced'),
  });
});

test('outgoing history strips only reserved cancellation provenance without mutating owned metadata', () => {
  const store = setup();
  cancel(store);
  const owned = store.read(ɵselectCommittedAgUiMessages);
  const marker = owned[1];
  const messages = [
    owned[0],
    { ...marker, metadata: { ...marker.metadata, unrelated: { keep: true } } },
  ] as Message[];

  const input = createCanonicalRunAgentInput({
    threadId: 't',
    runId: 'r',
    messages,
    state: undefined,
    tools: [],
  });

  expect(input.messages[1]).toEqual({
    ...marker,
    metadata: { unrelated: { keep: true } },
  });
  expect(messages[1].metadata).not.toEqual(input.messages[1].metadata);
});

test.each([
  'exact',
  'omitted',
  'content',
  'role',
  'toolCalls',
  'emptyToolCalls',
  'newId',
] as const)(
  'snapshot %s restores only exact owned plain-text cancellation provenance',
  (change) => {
    const store = setup();
    cancel(store);
    const owned = store.read(ɵselectCommittedAgUiMessages);
    const marker = owned[1];
    const input = createCanonicalRunAgentInput({
      threadId: 't',
      runId: 'r',
      messages: owned,
      state: undefined,
      tools: [],
    });
    const echo = {
      ...input.messages[1],
      metadata: {
        ...marker.metadata,
        [ɵCANCELLED_TURN_METADATA_KEY]: {
          v: 99,
          generationId: 'forged',
          reason: 'superseded',
        },
        remote: 'preserved',
      },
      ...(change === 'content' ? { content: 'Changed' } : {}),
      ...(change === 'role' ? { role: 'user' } : {}),
      ...(change === 'newId' ? { id: 'new-marker' } : {}),
      ...(change === 'emptyToolCalls' ? { toolCalls: [] } : {}),
      ...(change === 'toolCalls'
        ? {
            toolCalls: [
              {
                id: 'call',
                type: 'function',
                function: { name: 'lookup', arguments: '{}' },
              },
            ],
          }
        : {}),
    } as Message;

    store.dispatch(internalActions.generationAttemptStarted());
    store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));
    store.dispatch(
      apiActions.generateMessageEvent({
        type: EventType.MESSAGES_SNAPSHOT,
        messages:
          change === 'omitted'
            ? [input.messages[0]]
            : [input.messages[0], echo],
      }),
    );

    const history = store.read(ɵselectVisibleAgUiMessages);
    if (change === 'exact') {
      expect(history[1].metadata).toEqual({
        ...marker.metadata,
        remote: 'preserved',
      });
      expect(store.read(selectMessages)).toHaveLength(1);
      expect(store.read(selectRawStreamingMessage)).toBeNull();
      expect(store.read(selectViewMessages)).toHaveLength(1);
    } else if (change === 'omitted') {
      expect(history).toHaveLength(1);
    } else {
      expect(history[1].metadata).toEqual({ remote: 'preserved' });
      expect(store.read(selectMessages)).toHaveLength(2);
    }
  },
);

test.each([false, true])(
  'metadata-free snapshot remains hidden through structured projection with ui=%s',
  (ui) => {
    const store = setup();
    const responseSchema = s.object('Structured output', {
      text: s.string('Text'),
    });
    cancel(store);
    const owned = store.read(ɵselectCommittedAgUiMessages);
    const input = createCanonicalRunAgentInput({
      threadId: 't',
      runId: 'r',
      messages: owned,
      state: undefined,
      tools: [],
      ui,
    });
    store.dispatch(devActions.updateOptions({ responseSchema, ui }));

    store.dispatch(internalActions.generationAttemptStarted());
    store.dispatch(
      apiActions.generateMessageStart({ toolsByName: {}, responseSchema }),
    );
    store.dispatch(
      apiActions.generateMessageEvent({
        type: EventType.MESSAGES_SNAPSHOT,
        messages: input.messages,
      }),
    );

    expect(store.read(selectMessages)).toHaveLength(1);
    expect(store.read(selectViewMessages)).toHaveLength(1);
    expect(store.read(selectRawStreamingMessage)).toBeNull();
    expect(
      projectAgUiMessages(
        store.read(ɵselectVisibleAgUiMessages),
        {},
        responseSchema,
      ).messages,
    ).toHaveLength(1);
  },
);

test('authoritative snapshot omission does not allow a later metadata-free echo to regain ownership', () => {
  const store = setup();
  cancel(store);
  const owned = store.read(ɵselectCommittedAgUiMessages);
  const input = createCanonicalRunAgentInput({
    threadId: 't',
    runId: 'r',
    messages: owned,
    state: undefined,
    tools: [],
  });
  store.dispatch(internalActions.generationAttemptStarted());
  store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));

  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [input.messages[0]],
    }),
  );
  store.dispatch(
    apiActions.generateMessageEvent({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: input.messages,
    }),
  );

  expect(store.read(ɵselectVisibleAgUiMessages)[1].metadata).toBeUndefined();
  expect(store.read(selectMessages)).toHaveLength(2);
});
