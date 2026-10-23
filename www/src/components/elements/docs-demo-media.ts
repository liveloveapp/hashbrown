/** Recorded documentation demos, shared across React and Angular guides. */
export const DOCS_DEMOS = {
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
