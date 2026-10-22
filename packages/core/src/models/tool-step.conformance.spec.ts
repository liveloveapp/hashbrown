import { type AGUIEvent, EventType } from '@ag-ui/core';
import { type B4ToolStep, mergeToolStep } from '@b4run/sdk';
import { foldToolStepEvents, TOOL_STEP_FIXTURES } from '@b4run/sdk/testing';
import { apiActions, devActions, internalActions } from '../actions';
import {
  reducers,
  selectMessages,
  selectStreamingMessage,
  selectStreamingToolCallEntities,
  selectToolCallEntities,
  ɵprepareRootAction,
} from '../reducers';
import { createStore } from '../utils/micro-ngrx';
import { toViewMessagesFromInternal } from './internal_helpers';
import { ɵmergeToolStep, ɵreadToolStep, type ɵToolStep } from './tool-step';

const stepFields = [
  'status',
  'label',
  'sources',
  'error',
  'kind',
  'icon',
  'queries',
  'builtin',
  'provider',
] as const;

/** Selects the contract fields exposed by the server-tool-call view. */
function comparableStep(step: Partial<B4ToolStep>) {
  return Object.fromEntries(stepFields.map((field) => [field, step[field]]));
}

for (const fixture of TOOL_STEP_FIXTURES) {
  test(`conforms to the shared tool-step fixture: ${fixture.name}`, () => {
    const store = createStore({
      reducers,
      effects: [],
      prepareAction: ɵprepareRootAction,
    });
    store.dispatch(devActions.init({ system: '', canonicalMessages: [] }));
    store.dispatch(internalActions.generationAttemptStarted());
    store.dispatch(apiActions.generateMessageStart({ toolsByName: {} }));

    for (const event of fixture.events) {
      // The shared corpus omits AG-UI routing fields that its pure fold does not read.
      const frame = {
        threadId: 'thread-1',
        runId: 'run-1',
        parentMessageId: 'm1',
        ...(event.type === EventType.TEXT_MESSAGE_START
          ? { role: 'assistant' }
          : {}),
        ...event,
      } as AGUIEvent;
      store.dispatch(apiActions.generateMessageEvent(frame));
    }
    const state = store.read((state) => state);
    const calls = {
      ...selectStreamingToolCallEntities(state),
      ...selectToolCallEntities(state),
    };
    const streaming = selectStreamingMessage(state);
    const messages = [
      ...selectMessages(state).filter(
        (message) => message.id !== streaming?.id,
      ),
      ...(streaming ? [streaming] : []),
    ].flatMap((message) => toViewMessagesFromInternal(message, calls, []));
    const assistants = messages.filter(
      (message) => message.role === 'assistant',
    );
    const steps = Object.fromEntries(
      assistants.flatMap((message) =>
        (message.serverToolCalls ?? []).map((call) => {
          const status =
            call.status !== 'complete'
              ? 'running'
              : call.outcome === 'failure'
                ? 'failed'
                : call.outcome === 'denied' || call.outcome === 'cancelled'
                  ? call.outcome
                  : 'completed';
          // B4 materializes a step even for frame-only calls. Core deliberately
          // leaves those without step metadata until another write arrives.
          const storedStep = ɵreadToolStep(call.metadata?.['b4.step']);
          return [
            call.toolCallId,
            comparableStep({
              v: 1,
              ...call,
              kind: storedStep === undefined ? 'server' : call.kind,
              status,
              // Provider is retained in metadata, rather than a public view field.
              provider: storedStep?.provider,
            }),
          ];
        }),
      ),
    );
    const answers = Object.fromEntries(
      assistants.flatMap((message) =>
        message.citations !== undefined ||
        message.sources !== undefined ||
        message.attribution !== undefined
          ? [
              [
                message.id,
                {
                  v: 1,
                  citations: message.citations,
                  sources: message.sources,
                  attribution: message.attribution,
                },
              ],
            ]
          : [],
      ),
    );

    expect(foldToolStepEvents(fixture.events)).toEqual(fixture.expected);
    expect(steps).toEqual(
      Object.fromEntries(
        Object.entries(fixture.expected.steps).map(([id, step]) => [
          id,
          comparableStep(step),
        ]),
      ),
    );
    expect(answers).toEqual(fixture.expected.answers ?? {});
    expect(state.agUiMessages.protocolError).toBeUndefined();
  });
}

const statuses = [
  'running',
  'completed',
  'failed',
  'denied',
  'cancelled',
] as const;
for (const carrier of ['call', 'message'] as const) {
  for (const previousStatus of statuses) {
    for (const nextStatus of statuses) {
      test(`merges ${previousStatus} to ${nextStatus} on ${carrier} like B4`, () => {
        const previous: ɵToolStep = {
          v: 1,
          kind: 'server',
          status: previousStatus,
          label: 'Previous',
          icon: 'search',
          sources: [{ id: 'old', kind: 'record', title: 'Old' }],
          queries: ['previous'],
          startedAt: 100,
          ...(previousStatus === 'failed'
            ? { error: { message: 'Previous failure' } }
            : {}),
        };
        const next: ɵToolStep = {
          v: 1,
          kind: 'server',
          status: nextStatus,
          label: 'Next',
          sources: [{ id: 'new', kind: 'record', title: 'New' }],
          ...(nextStatus === 'failed'
            ? { error: { message: 'Next failure' } }
            : {}),
        };

        // A settle must also drop running-only fields when none are restated.
        const sparse: ɵToolStep = { v: 1, kind: 'server', status: nextStatus };

        const actual = ɵmergeToolStep(previous, next, carrier);
        const sparseActual = ɵmergeToolStep(previous, sparse, carrier);

        expect(actual).toEqual(mergeToolStep(previous, next, carrier));
        expect(sparseActual).toEqual(mergeToolStep(previous, sparse, carrier));
      });
    }
  }
}
