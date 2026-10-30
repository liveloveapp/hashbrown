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
    width: 740,
    height: 670,
    groups: [
      { label: 'LIVE EXECUTION', x: 8, y: 12, width: 304, height: 640 },
      {
        label: 'RECORDED OBSERVATIONS',
        x: 420,
        y: 12,
        width: 312,
        height: 640,
      },
    ],
    nodes: [
      {
        id: 'run',
        title: 'Live run',
        detail: 'Provider and application events',
        x: 20,
        y: 70,
        width: 280,
      },
      {
        id: 'capture',
        title: 'Capture',
        detail: 'Recorded observations',
        x: 440,
        y: 70,
        width: 280,
      },
      {
        id: 'timeline',
        title: 'Timeline',
        detail: 'Select one moment',
        x: 440,
        y: 280,
        width: 280,
        accent: true,
      },
      {
        id: 'views',
        title: 'Synchronized views',
        detail: 'Chat, requests, JSON, UI and state',
        x: 440,
        y: 490,
        width: 280,
      },
    ],
    edges: [
      { from: 'run', to: 'capture', label: { text: 'record', x: 370, y: 98 } },
      {
        from: 'capture',
        to: 'timeline',
        label: { text: 'read capture', x: 650, y: 228 },
      },
      {
        from: 'timeline',
        to: 'views',
        label: { text: 'project', x: 650, y: 438 },
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
    width: 740,
    height: 600,
    nodes: [
      {
        id: 'instructions',
        title: 'Application instructions',
        detail: 'Task, scope and output expectations',
        x: 20,
        y: 20,
        width: 320,
      },
      {
        id: 'input',
        title: 'User input',
        detail: 'The material to work with',
        x: 400,
        y: 20,
        width: 320,
      },
      {
        id: 'request',
        title: 'Model request',
        detail: 'Distinct instruction and message roles',
        x: 220,
        y: 240,
        width: 300,
        accent: true,
      },
      {
        id: 'response',
        title: 'Response',
        detail: 'Review against the application contract',
        x: 220,
        y: 450,
        width: 300,
      },
    ],
    edges: [
      {
        from: 'instructions',
        to: 'request',
        points: [
          [180, 136],
          [180, 190],
          [300, 190],
          [300, 240],
        ],
        label: { text: 'instructions', x: 80, y: 178 },
      },
      {
        from: 'input',
        to: 'request',
        points: [
          [560, 114],
          [560, 190],
          [440, 190],
          [440, 240],
        ],
        label: { text: 'task data', x: 650, y: 178 },
      },
      {
        from: 'request',
        to: 'response',
        label: { text: 'generate', x: 440, y: 414 },
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
    width: 740,
    height: 610,
    nodes: [
      {
        id: 'generate',
        title: 'Generating',
        detail: 'A response is still arriving',
        x: 220,
        y: 20,
        width: 300,
      },
      {
        id: 'review',
        title: 'Ready for review',
        detail: 'A draft, not a saved change',
        x: 220,
        y: 210,
        width: 300,
        accent: true,
      },
      {
        id: 'applied',
        title: 'Applied',
        detail: 'The application confirmed the write',
        x: 20,
        y: 440,
        width: 320,
      },
      {
        id: 'discard',
        title: 'Discarded',
        detail: 'No application write',
        x: 400,
        y: 440,
        width: 320,
      },
    ],
    edges: [
      {
        from: 'generate',
        to: 'review',
        label: { text: 'draft available', x: 470, y: 170 },
      },
      {
        from: 'review',
        to: 'applied',
        points: [
          [370, 304],
          [370, 370],
          [180, 370],
          [180, 440],
        ],
        label: { text: 'apply + confirm', x: 180, y: 354 },
      },
      {
        from: 'review',
        to: 'discard',
        points: [
          [370, 304],
          [370, 370],
          [560, 370],
          [560, 440],
        ],
        label: { text: 'discard', x: 560, y: 354 },
      },
    ],
  },
} satisfies Record<string, DiagramDefinition>;
