import type { DiagramDefinition } from '../diagram-types';

/** Sources: runtime/workbench.ts and workbench-view.ts; playback observes captured events, never runs the agent. */
export const LEARNING_DIAGRAMS = {
  'workbench-observations': {
    kind: 'architecture',
    title: 'Replay selects an observation of the same run',
    caption:
      'The timeline selects recorded observations. Requests, JSON, UI and state follow that selection. Seeking does not send a request or repeat an application action.',
    description:
      'A live run produces observations that the workbench captures. The timeline selects a moment in that capture. The chat, inspector and state view project the recorded conversation at that moment. Moving the timeline reads the capture; it does not execute provider requests, tool handlers or saved application actions.',
    width: 1040,
    height: 480,
    groups: [
      { label: 'LIVE EXECUTION', x: 12, y: 12, width: 300, height: 454 },
      {
        label: 'RECORDED OBSERVATIONS',
        x: 350,
        y: 12,
        width: 678,
        height: 454,
      },
    ],
    nodes: [
      {
        id: 'run',
        title: 'Live run',
        detail: 'Provider and application events',
        x: 36,
        y: 100,
        width: 252,
      },
      {
        id: 'capture',
        title: 'Capture',
        detail: 'Recorded observations',
        x: 388,
        y: 100,
        width: 250,
      },
      {
        id: 'timeline',
        title: 'Timeline',
        detail: 'Select one moment',
        x: 388,
        y: 300,
        width: 250,
        accent: true,
      },
      {
        id: 'views',
        title: 'Synchronized views',
        detail: 'Chat, requests, JSON, UI and state',
        x: 748,
        y: 300,
        width: 252,
      },
    ],
    edges: [
      { from: 'run', to: 'capture', label: { text: 'record', x: 338, y: 130 } },
      {
        from: 'capture',
        to: 'timeline',
        label: { text: 'read capture', x: 571, y: 258 },
      },
      {
        from: 'timeline',
        to: 'views',
        label: { text: 'project', x: 693, y: 334 },
      },
    ],
  },
  // Sources: guide/prompt-engineering.md example; system instructions and user messages are distinct request inputs, not an authorization mechanism.
  'prompt-context-boundary': {
    kind: 'architecture',
    title: 'Give instructions and task data a clear source',
    caption:
      'Instructions describe the task. User input supplies the material to work with. Your endpoint still owns access checks and trusted configuration.',
    description:
      'Application instructions and user-supplied task data enter the model request through separate roles. The model uses that context to produce a response. Clear roles help describe the task; they do not authorize an application operation or make untrusted input safe. The application checks any resulting action independently.',
    width: 1040,
    height: 420,
    nodes: [
      {
        id: 'instructions',
        title: 'Application instructions',
        detail: 'Task, scope and output expectations',
        x: 24,
        y: 36,
        width: 268,
      },
      {
        id: 'input',
        title: 'User input',
        detail: 'The material to work with',
        x: 24,
        y: 250,
        width: 268,
      },
      {
        id: 'request',
        title: 'Model request',
        detail: 'Distinct instruction and message roles',
        x: 410,
        y: 148,
        width: 250,
        accent: true,
      },
      {
        id: 'response',
        title: 'Response',
        detail: 'Review against the application contract',
        x: 770,
        y: 148,
        width: 246,
      },
    ],
    edges: [
      {
        from: 'instructions',
        to: 'request',
        points: [
          [292, 100],
          [350, 100],
          [350, 180],
          [410, 180],
        ],
        label: { text: 'instructions', x: 350, y: 80 },
      },
      {
        from: 'input',
        to: 'request',
        points: [
          [292, 300],
          [350, 300],
          [350, 224],
          [410, 224],
        ],
        label: { text: 'task data', x: 350, y: 336 },
      },
      {
        from: 'request',
        to: 'response',
        label: { text: 'generate', x: 715, y: 180 },
      },
    ],
  },
  // Sources: guide/ethics.md canReviewDraft checks completion/freshness; independent server authorization remains required.
  'proposal-lifecycle': {
    kind: 'state',
    title: 'Keep a proposal separate from an applied change',
    caption:
      'A generated value is a draft. Apply it only after the user reviews the current draft and the application confirms the change.',
    description:
      'Generation produces a proposal for review. The user can edit or discard it. An explicit Apply action checks the current draft and permission before writing. Only a confirmed write reaches Applied. Failure paths are omitted from this focused diagram; a failed generation or write must not be displayed as Applied. This is an application interaction model, not an SDK persistence state machine.',
    width: 1040,
    height: 440,
    nodes: [
      {
        id: 'generate',
        title: 'Generating',
        detail: 'A response is still arriving',
        x: 24,
        y: 48,
        width: 224,
      },
      {
        id: 'review',
        title: 'Ready for review',
        detail: 'A draft, not a saved change',
        x: 408,
        y: 48,
        width: 224,
        accent: true,
      },
      {
        id: 'applied',
        title: 'Applied',
        detail: 'The application confirmed the write',
        x: 792,
        y: 48,
        width: 224,
      },
      {
        id: 'discard',
        title: 'Discarded',
        detail: 'No application write',
        x: 408,
        y: 288,
        width: 224,
      },
    ],
    edges: [
      {
        from: 'generate',
        to: 'review',
        label: { text: 'draft available', x: 328, y: 80 },
      },
      {
        from: 'review',
        to: 'applied',
        label: { text: 'apply + confirm', x: 712, y: 80 },
      },
      {
        from: 'review',
        to: 'discard',
        label: { text: 'discard', x: 567, y: 236 },
      },
    ],
  },
} satisfies Record<string, DiagramDefinition>;
