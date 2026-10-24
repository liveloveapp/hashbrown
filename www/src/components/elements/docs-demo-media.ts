/** Recorded documentation demos, shared across React and Angular guides. */
export const DOCS_DEMOS = {
  'structured-form': {
    title: 'Generate a draft. Review it. Apply it.',
    caption:
      'Turn a request into typed shopping-list items and explicitly apply a validated draft.',
    recording:
      'Recorded in the checked shopping-list example with scripted AG-UI output. React recorded; Angular verified. Presentation styles added. No narration or server write.',
  },
  'streaming-data': {
    title: 'Show complete items as they arrive.',
    caption:
      'Stream a draft list while keeping Apply disabled until successful completion and validation.',
    recording:
      'Recorded in the checked shopping-list example with delayed scripted AG-UI output. React recorded; Angular verified. Presentation styles added. No narration or server write.',
  },
  'public-endpoint': {
    title: 'Check access before starting a reply.',
    caption:
      'Reject an anonymous request and another owner’s thread, then stream an authorized reply.',
    recording:
      'Recorded against the checked Express example. Local fixture sessions, an in-memory thread store, and scripted provider responses. Presentation styles added. No narration.',
  },
  'server-threads': {
    title: 'Save on the server. Continue in the browser.',
    caption:
      'Refresh and switch between two versioned, server-stored text conversations.',
    recording:
      'Recorded in the checked thread clients. Local fixture sessions, an in-memory server store, and scripted provider responses. Completed text only. Presentation styles added. No narration.',
  },
  'javascript-runtime': {
    title: 'Your functions. Code in QuickJS.',
    caption:
      'Calculate a basket total, try unavailable browser access and invalid arguments, then recover.',
    recording:
      'Recorded in the checked runtime clients with real QuickJS execution, a fixed basket, and prewritten scripts. Presentation styles added. No model call or narration.',
  },
  persistence: {
    title: 'Refresh. Restore. Continue.',
    caption:
      'Save a completed text exchange, refresh, and switch between two browser-stored conversations.',
    recording:
      'Recorded in the browser-storage example with scripted responses. Only completed text is restored. Presentation styles added. No narration.',
  },
  interrupts: {
    title: 'Pause for approval. Resume together.',
    caption:
      'Collect every answer in an interrupt batch before resuming the trip plan.',
    recording:
      'Recorded in the checked workflow example with a scripted AG-UI agent. Presentation styles added. No narration.',
  },
  'shared-state': {
    title: 'Edit the app. Update the agent.',
    caption:
      'Send an edited destination as shared state and display the agent’s returned update.',
    recording:
      'Recorded in the checked workflow example with a scripted AG-UI agent. Presentation styles added. No narration.',
  },
  activities: {
    title: 'Show progress as work happens.',
    caption:
      'Watch a three-step itinerary update through display-only activities.',
    recording:
      'Recorded in the checked workflow example with a scripted AG-UI agent. Presentation styles added. No narration.',
  },
  'ui-kits': {
    title: 'One trusted kit. Two useful cards.',
    caption:
      'Generate WelcomeCard and StatusCard from the same exposed UI kit.',
    recording:
      'Recorded in the checked workflow example with a scripted AG-UI agent. Presentation styles added. No narration.',
  },

  'welcome-card': {
    title: 'Generate your first welcome card.',
    caption:
      'Expose a WelcomeCard, send a prompt, and render validated props with your component.',
    recording:
      'Recorded in the Quickstart example with scripted model responses. Presentation styles added. No narration.',
  },
  conversation: {
    title: 'Keep context between turns.',
    caption:
      'Send a name, receive a reply, and ask a follow-up in the same text conversation.',
    recording:
      'Recorded in the Messages and turns example with scripted model responses. Presentation styles added. No persistence after refresh is shown. No narration.',
  },
  'generative-ui': {
    title: 'Your components. Generated UI.',
    caption:
      'Expose trusted components and let the model choose what to render.',
  },
  streaming: {
    title: 'Render as the response arrives.',
    caption: 'Watch a streamed response render into the application’s own UI.',
  },
  'browser-tools': {
    title: 'Give the model useful tools.',
    caption:
      'Read application state through tool handlers that run in the browser.',
  },
  schemas: {
    title: 'Plain words. Structured output.',
    caption:
      'Turn a natural-language request into a typed filter with Skillet.',
  },
  decisions: {
    title: 'Route intent. Narrow the UI.',
    caption:
      'Choose a workflow and narrow the components available for a response.',
  },
  debugging: {
    title: 'Inspect an AI interaction.',
    caption:
      'Inspect routing decisions, streamed UI JSON, and tool-call arguments in the ATC developer drawer.',
  },
} as const satisfies Record<
  string,
  { title: string; caption: string; recording?: string }
>;

/** The stable identifier of a recorded documentation demo. */
export type DocsDemoId = keyof typeof DOCS_DEMOS;
