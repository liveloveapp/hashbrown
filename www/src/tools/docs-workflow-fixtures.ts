import { type AGUIEvent, EventType, type RunAgentInput } from '@ag-ui/core';

/** Independently recordable examples of the client workflow APIs. */
export type WorkflowDemoMode =
  'interrupts' | 'shared-state' | 'activities' | 'ui-kits';

/**
 * Produces deterministic AG-UI responses for the real documentation clients.
 * Input state and resume entries determine the result; no server session or
 * provider credentials are needed. These events demonstrate the wire protocol,
 * rather than a production authorization or booking service.
 * @param input - The actual client request, including state and resume entries.
 * @param mode - The independently selected workflow to demonstrate.
 * @returns A fresh event sequence without mutating the request.
 */
export function createWorkflowEvents(
  input: RunAgentInput,
  mode: WorkflowDemoMode,
): AGUIEvent[] {
  const identity = { threadId: input.threadId, runId: input.runId };
  const started: AGUIEvent = { type: EventType.RUN_STARTED, ...identity };
  const finished: AGUIEvent = { type: EventType.RUN_FINISHED, ...identity };
  const messageId = `${input.runId}:answer`;
  const text = (delta: string): AGUIEvent[] => [
    { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta },
    { type: EventType.TEXT_MESSAGE_END, messageId },
  ];

  if (mode === 'interrupts') {
    if (!input.resume) {
      return [
        started,
        ...text('Your Lisbon itinerary needs approval.'),
        {
          ...finished,
          outcome: {
            type: 'interrupt',
            interrupts: [
              {
                id: 'approve-trip',
                reason: 'approval',
                message: 'Approve this itinerary?',
              },
              {
                id: 'confirm-destination',
                reason: 'confirmation',
                message: 'Confirm Lisbon as the destination?',
              },
            ],
          },
        },
      ];
    }
    const ids = ['approve-trip', 'confirm-destination'];
    if (
      input.resume.length !== ids.length ||
      !ids.every((id) =>
        input.resume?.some((entry) => entry.interruptId === id),
      )
    ) {
      return [
        started,
        {
          type: EventType.RUN_ERROR,
          message: 'Respond to every interrupt in the batch.',
        },
      ];
    }
    const approved = input.resume.every(
      (entry) => entry.status === 'resolved' && entry.payload === true,
    );
    return [
      started,
      ...text(
        approved
          ? 'Approved. Your Lisbon itinerary is ready.'
          : 'The trip was not approved. No booking was made.',
      ),
      finished,
    ];
  }

  if (mode === 'shared-state') {
    const state = input.state;
    const destination =
      state &&
      typeof state === 'object' &&
      'destination' in state &&
      typeof state.destination === 'string'
        ? state.destination
        : 'Lisbon';
    return [
      started,
      {
        type: EventType.STATE_SNAPSHOT,
        snapshot: { destination, status: 'Planning' },
      },
      ...text(`Your ${destination} plan is ready.`),
      {
        type: EventType.STATE_DELTA,
        delta: [{ op: 'replace', path: '/status', value: 'Ready' }],
      },
      finished,
    ];
  }

  if (mode === 'activities') {
    const activityId = `${input.runId}:plan`;
    return [
      started,
      {
        type: EventType.ACTIVITY_SNAPSHOT,
        messageId: activityId,
        activityType: 'trip-progress',
        content: { completed: 0, total: 3, label: 'Finding places' },
      },
      ...['Places selected', 'Route arranged', 'Itinerary complete'].map(
        (label, index): AGUIEvent => ({
          type: EventType.ACTIVITY_DELTA,
          messageId: activityId,
          activityType: 'trip-progress',
          patch: [
            { op: 'replace', path: '/completed', value: index + 1 },
            { op: 'replace', path: '/label', value: label },
          ],
        }),
      ),
      ...text('Your three-day Lisbon itinerary is ready.'),
      finished,
    ];
  }

  const lastRequest = input.messages
    .filter((message) => message.role === 'user')
    .at(-1);
  const statusCard =
    typeof lastRequest?.content === 'string' &&
    lastRequest.content.includes('status card');
  const component = statusCard ? 'StatusCard' : 'WelcomeCard';
  const props = statusCard
    ? {
        title: 'Your trip is ready',
        message: 'Three days in Lisbon, rendered with a trusted component.',
      }
    : {
        title: 'Welcome to Lisbon',
        message: 'A trusted card from your UI kit.',
      };
  return [
    started,
    ...text(JSON.stringify({ ui: [{ [component]: { props } }] })),
    finished,
  ];
}
