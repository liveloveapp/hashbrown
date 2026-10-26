import { EventType, type RunAgentInput } from '@ag-ui/core';
import { expect, test } from 'vitest';
import { createWorkflowEvents } from '../../src/tools/docs-workflow-fixtures';

const input: RunAgentInput = {
  threadId: 'workflow-thread',
  runId: 'workflow-run',
  messages: [{ id: 'question', role: 'user', content: 'Start' }],
  tools: [],
  context: [],
  state: { destination: 'Lisbon', status: 'Draft' },
  forwardedProps: {},
};

test('interrupts pause with a complete batch and resume only after its approval', () => {
  const original = structuredClone(input);

  const paused = createWorkflowEvents(input, 'interrupts');
  const resumed = createWorkflowEvents(
    {
      ...input,
      resume: [
        { interruptId: 'approve-trip', status: 'resolved', payload: true },
        {
          interruptId: 'confirm-destination',
          status: 'resolved',
          payload: true,
        },
      ],
    },
    'interrupts',
  );

  expect(paused.at(-1)).toMatchObject({
    type: EventType.RUN_FINISHED,
    outcome: {
      type: 'interrupt',
      interrupts: [{ id: 'approve-trip' }, { id: 'confirm-destination' }],
    },
  });
  expect(resumed).toContainEqual(
    expect.objectContaining({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: 'Approved. Your Lisbon itinerary is ready.',
    }),
  );
  expect(resumed.at(-1)).not.toHaveProperty('outcome');
  expect(input).toEqual(original);
});

test('incomplete or declined approval never produces an approved result', () => {
  const partial = {
    ...input,
    resume: [
      {
        interruptId: 'approve-trip',
        status: 'resolved' as const,
        payload: true,
      },
    ],
  };
  const declined = {
    ...input,
    resume: [
      { interruptId: 'approve-trip', status: 'cancelled' as const },
      {
        interruptId: 'confirm-destination',
        status: 'resolved' as const,
        payload: true,
      },
    ],
  };

  const partialEvents = createWorkflowEvents(partial, 'interrupts');
  const declinedEvents = createWorkflowEvents(declined, 'interrupts');

  expect(partialEvents.at(-1)).toMatchObject({ type: EventType.RUN_ERROR });
  expect(declinedEvents).toContainEqual(
    expect.objectContaining({
      delta: 'The trip was not approved. No booking was made.',
    }),
  );
});

test('shared state uses the local edit and patches the agent status without changing input', () => {
  const edited = { ...input, state: { destination: 'Kyoto', status: 'Draft' } };

  const events = createWorkflowEvents(edited, 'shared-state');

  expect(events).toContainEqual({
    type: EventType.STATE_SNAPSHOT,
    snapshot: { destination: 'Kyoto', status: 'Planning' },
  });
  expect(events).toContainEqual({
    type: EventType.STATE_DELTA,
    delta: [{ op: 'replace', path: '/status', value: 'Ready' }],
  });
  expect(events).toContainEqual(
    expect.objectContaining({ delta: 'Your Kyoto plan is ready.' }),
  );
  expect(edited.state).toEqual({ destination: 'Kyoto', status: 'Draft' });
});

test('activity events update one run-scoped activity from progress to completion', () => {
  const events = createWorkflowEvents(input, 'activities');

  const snapshots = events.filter(
    (event) => event.type === EventType.ACTIVITY_SNAPSHOT,
  );
  const patches = events.filter(
    (event) => event.type === EventType.ACTIVITY_DELTA,
  );

  expect(snapshots).toEqual([
    expect.objectContaining({
      messageId: 'workflow-run:plan',
      activityType: 'trip-progress',
      content: { completed: 0, total: 3, label: 'Finding places' },
    }),
  ]);
  expect(patches).toHaveLength(3);
  expect(patches.at(-1)).toMatchObject({
    messageId: 'workflow-run:plan',
    patch: expect.arrayContaining([
      { op: 'replace', path: '/completed', value: 3 },
      { op: 'replace', path: '/label', value: 'Itinerary complete' },
    ]),
  });
  expect(events.at(-1)).toMatchObject({
    type: EventType.RUN_FINISHED,
    runId: input.runId,
    threadId: input.threadId,
  });
});

test('UI kit fixtures select a trusted card from the latest user request', () => {
  const requested = {
    ...input,
    messages: [
      ...input.messages,
      {
        id: 'latest',
        role: 'user' as const,
        content: 'Generate a status card',
      },
    ],
  };

  const welcome = createWorkflowEvents(input, 'ui-kits');
  const status = createWorkflowEvents(requested, 'ui-kits');
  const welcomeText = welcome.find(
    (event) => event.type === EventType.TEXT_MESSAGE_CONTENT,
  );
  const statusText = status.find(
    (event) => event.type === EventType.TEXT_MESSAGE_CONTENT,
  );

  expect(welcomeText).toMatchObject({
    delta: JSON.stringify({
      ui: [
        {
          WelcomeCard: {
            props: {
              title: 'Welcome to Lisbon',
              message: 'A trusted card from your UI kit.',
            },
          },
        },
      ],
    }),
  });
  expect(statusText).toMatchObject({
    delta: JSON.stringify({
      ui: [
        {
          StatusCard: {
            props: {
              title: 'Your trip is ready',
              message:
                'Three days in Lisbon, rendered with a trusted component.',
            },
          },
        },
      ],
    }),
  });
});
