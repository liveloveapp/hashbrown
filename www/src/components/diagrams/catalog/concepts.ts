import type { DiagramDefinition } from '../diagram-types';

/** Concept diagrams shared by the Angular and React guides. */
export const CONCEPT_DIAGRAM_DEFINITIONS: Record<string, DiagramDefinition> = {
  // Sources: packages/core/src/models/group-turns.ts, packages/core/src/effects/generate-message.effects.ts.
  'concept-conversation-turn': {
    kind: 'sequence',
    title: 'A turn can need several requests',
    caption:
      'A user turn includes the work needed to answer it. A tool result can lead to another model request.',
    description:
      'The user sends one message. The client requests a model response, receives a tool call, runs its handler, sends the result in a second request, and receives an assistant reply.',
    participants: [
      {
        id: 'user',
        title: 'User',
      },
      {
        id: 'client',
        title: 'Chat client',
      },
      {
        id: 'model',
        title: 'Model',
      },
      {
        id: 'tool',
        title: 'Tool handler',
      },
    ],
    messages: [
      {
        from: 'user',
        to: 'client',
        label: 'User message starts a turn',
      },
      {
        from: 'client',
        to: 'model',
        label: 'Request 1: current history',
      },
      {
        from: 'model',
        to: 'client',
        label: 'Request a tool call',
      },
      {
        from: 'client',
        to: 'tool',
        label: 'Run the handler',
      },
      {
        from: 'tool',
        to: 'client',
        label: 'Return the tool result',
      },
      {
        from: 'client',
        to: 'model',
        label: 'Request 2: history and result',
      },
      {
        from: 'model',
        to: 'client',
        label: 'Assistant reply',
      },
      {
        from: 'client',
        to: 'user',
        label: 'Display the reply',
      },
    ],
  },
  // Sources: packages/core/src/effects/generate-message.effects.ts, www/examples/quickstart/react/src/Workbench.tsx, www/examples/quickstart/angular/src/app/workbench.ts.
  'concept-tools-round-trip': {
    kind: 'sequence',
    title: 'A tool connects the model to application code',
    caption:
      'The model requests a call. Your registered handler runs the application function and returns its result.',
    description:
      'A client sends tool descriptions with a request. The model asks for a named tool with arguments. The client calls its browser handler, receives application data, and sends that result for the next model response.',
    participants: [
      {
        id: 'client',
        title: 'Chat client',
      },
      {
        id: 'model',
        title: 'Model',
      },
      {
        id: 'handler',
        title: 'Browser handler',
      },
    ],
    messages: [
      {
        from: 'client',
        to: 'model',
        label: 'Conversation and tool descriptions',
      },
      {
        from: 'model',
        to: 'client',
        label: 'Tool name and arguments',
      },
      {
        from: 'client',
        to: 'handler',
        label: 'Invoke the registered handler',
      },
      {
        from: 'handler',
        to: 'client',
        label: 'Application result or error',
      },
      {
        from: 'client',
        to: 'model',
        label: 'Continue with the tool result',
      },
      {
        from: 'model',
        to: 'client',
        label: 'Reply using the result',
      },
    ],
  },
  // Sources: packages/core/src/reducers/ag-ui-activity.ts, packages/core/src/models/group-turns.ts, packages/openai/src/stream/openai-input.ts.
  'concept-activity-audience': {
    kind: 'architecture',
    title: 'Progress and tool results have different readers',
    caption:
      'Activities describe actual work to the interface. Tool results supply information for the model.',
    description:
      'Work performed by an agent can produce activity events for the progress interface and tool results for a model continuation. Activities do not enter the outgoing model conversation.',
    width: 1040,
    height: 490,
    nodes: [
      {
        id: 'work',
        x: 24,
        y: 175,
        width: 250,
        title: 'Agent work',
        detail: 'Report stages as they occur',
      },
      {
        id: 'activity',
        x: 420,
        y: 35,
        width: 260,
        title: 'Activity event',
        detail: 'Snapshot, then deltas',
      },
      {
        id: 'tool',
        x: 420,
        y: 315,
        width: 260,
        title: 'Tool result',
        detail: 'Data needed to continue',
      },
      {
        id: 'ui',
        x: 800,
        y: 35,
        width: 220,
        title: 'Progress UI',
        detail: 'Display-only messages',
      },
      {
        id: 'model',
        x: 800,
        y: 315,
        width: 220,
        title: 'Model',
        detail: 'Next request context',
      },
    ],
    edges: [
      {
        from: 'work',
        to: 'activity',
        points: [
          [274, 225],
          [340, 225],
          [340, 95],
          [420, 95],
        ],
      },
      {
        from: 'work',
        to: 'tool',
        points: [
          [274, 245],
          [360, 245],
          [360, 375],
          [420, 375],
        ],
      },
      {
        from: 'activity',
        to: 'ui',
        points: [
          [680, 95],
          [800, 95],
        ],
      },
      {
        from: 'tool',
        to: 'model',
        points: [
          [680, 375],
          [800, 375],
        ],
      },
    ],
  },
  // Sources: packages/core/src/models/interrupt.ts, packages/core/src/transport/interrupt-validation.ts, www/examples/quickstart/server/workbench-workflows.ts.
  'concept-interrupt-resume': {
    kind: 'sequence',
    title: 'Pause for a person, then resume the interaction',
    caption:
      'Submit the pending batch together. The agent checks the answers before continuing permitted work.',
    description:
      'An agent pauses an interaction at a checkpoint and sends pending interrupts. The client asks a person for answers, submits the complete batch, and receives the agent continuation after server checks. Approval alone does not establish execution or success.',
    participants: [
      {
        id: 'agent',
        title: 'Agent checkpoint',
      },
      {
        id: 'client',
        title: 'Chat client',
      },
      {
        id: 'person',
        title: 'Person',
      },
    ],
    messages: [
      {
        from: 'agent',
        to: 'client',
        label: 'Pause with pending interrupts',
      },
      {
        from: 'client',
        to: 'person',
        label: 'Show questions or approval form',
      },
      {
        from: 'person',
        to: 'client',
        label: 'Answer the pending questions',
      },
      {
        from: 'client',
        to: 'agent',
        label: 'Resume with the complete batch',
      },
      {
        from: 'agent',
        to: 'client',
        label: 'Check answers; continue or decline',
      },
    ],
  },
  // Sources: packages/core/src/reducers/agent-state.reducer.ts, www/examples/quickstart/server/workbench-workflows.ts.
  'concept-shared-state': {
    kind: 'sequence',
    title: 'State travels beside the conversation',
    caption:
      'The agent explicitly maps validated state into model context. Updating local state alone sends no request.',
    description:
      'The application supplies JSON state in a request. The agent validates it and maps relevant values into model context. State snapshots or deltas update the client draft, which commits on successful completion or rolls back on a failed attempt.',
    participants: [
      {
        id: 'app',
        title: 'Application',
      },
      {
        id: 'agent',
        title: 'AG-UI agent',
      },
      {
        id: 'model',
        title: 'Model',
      },
    ],
    messages: [
      {
        from: 'app',
        to: 'agent',
        label: 'Send conversation and JSON state',
      },
      {
        from: 'agent',
        to: 'model',
        label: 'Map validated state into context',
      },
      {
        from: 'model',
        to: 'agent',
        label: 'Return model output',
      },
      {
        from: 'agent',
        to: 'app',
        label: 'STATE_SNAPSHOT or STATE_DELTA',
      },
      {
        from: 'agent',
        to: 'app',
        label: 'Successful completion commits draft',
      },
    ],
  },
  // Sources: packages/core/src/runtime/create-runtime-impl.ts, packages/core/src/runtime/attach-function-to-context.ts, www/examples/quickstart/runtime/workbench-javascript.ts.
  'concept-runtime-capabilities': {
    kind: 'sequence',
    title: 'QuickJS uses only the capabilities you expose',
    caption:
      'Each run has a fresh context. Host handlers run outside QuickJS and must validate their own inputs.',
    description:
      'The application submits a script to a fresh QuickJS context. A script may call an explicitly registered host function. The host validates and returns its result, then QuickJS returns the evaluation result or an error wrapper. Host side effects are not rolled back by a runtime timeout.',
    participants: [
      {
        id: 'app',
        title: 'Application',
      },
      {
        id: 'js',
        title: 'QuickJS context',
      },
      {
        id: 'host',
        title: 'Registered host function',
      },
    ],
    messages: [
      {
        from: 'app',
        to: 'js',
        label: 'Evaluate script in a fresh context',
      },
      {
        from: 'js',
        to: 'host',
        label: 'Optional explicit capability call',
      },
      {
        from: 'host',
        to: 'js',
        label: 'Validate arguments; return data',
      },
      {
        from: 'js',
        to: 'app',
        label: 'Evaluation result or error',
      },
    ],
  },
  // Sources: packages/core/src/schema/base.ts, packages/core/src/ui/expose-component.ts, packages/core/src/models/view.models.ts.
  'concept-schema-consumers': {
    kind: 'architecture',
    title: 'One schema language, several contracts',
    caption:
      'A schema describes a value. Application code still checks facts, permissions, and business rules.',
    description:
      'Skillet schemas describe tool arguments, structured response values, and exposed component inputs. The same definitions infer TypeScript types for application code; they do not establish domain facts.',
    width: 750,
    height: 500,
    nodes: [
      {
        id: 'schema',
        x: 24,
        y: 190,
        width: 260,
        title: 'Skillet schema',
        detail: 'Fields, types, descriptions',
      },
      {
        id: 'tool',
        x: 440,
        y: 24,
        width: 270,
        title: 'Tool arguments',
        detail: 'Contract for a requested call',
      },
      {
        id: 'response',
        x: 440,
        y: 190,
        width: 270,
        title: 'Structured response',
        detail: 'Contract for returned data',
      },
      {
        id: 'props',
        x: 440,
        y: 356,
        width: 270,
        title: 'Component inputs',
        detail: 'Contract for generated props',
      },
    ],
    edges: [
      {
        from: 'schema',
        to: 'tool',
        points: [
          [284, 230],
          [355, 230],
          [355, 84],
          [440, 84],
        ],
      },
      {
        from: 'schema',
        to: 'response',
        points: [
          [284, 250],
          [440, 250],
        ],
      },
      {
        from: 'schema',
        to: 'props',
        points: [
          [284, 270],
          [355, 270],
          [355, 416],
          [440, 416],
        ],
      },
    ],
  },
  // Sources: packages/core/src/chat-runtime.ts, packages/core/src/reducers/ag-ui-message-history.ts.
  'concept-history-context': {
    kind: 'architecture',
    title: 'History is supplied with the next request',
    caption:
      'Storage and transcript selection belong to your application. A thread ID does not load a saved conversation.',
    description:
      'An application may load a selected transcript from its storage into chat history. The next user message joins that history in the outgoing request. The model receives the supplied context rather than remembering a browser session independently.',
    width: 1064,
    height: 420,
    nodes: [
      {
        id: 'store',
        x: 24,
        y: 35,
        width: 250,
        title: 'Application storage',
        detail: 'Selected transcript',
      },
      {
        id: 'history',
        x: 400,
        y: 35,
        width: 250,
        title: 'Chat history',
        detail: 'Earlier messages',
      },
      {
        id: 'new',
        x: 400,
        y: 265,
        width: 250,
        title: 'New user message',
        detail: 'Current request',
      },
      {
        id: 'request',
        x: 790,
        y: 150,
        width: 250,
        title: 'Next model request',
        detail: 'History and current message',
      },
    ],
    edges: [
      {
        from: 'store',
        to: 'history',
        points: [
          [274, 95],
          [400, 95],
        ],
        label: {
          text: 'load',
          x: 335,
          y: 76,
        },
      },
      {
        from: 'history',
        to: 'request',
        points: [
          [650, 95],
          [715, 95],
          [715, 200],
          [790, 200],
        ],
      },
      {
        from: 'new',
        to: 'request',
        points: [
          [650, 325],
          [740, 325],
          [740, 225],
          [790, 225],
        ],
      },
    ],
  },
  // Sources: packages/core/src/ui/expose-component.ts, packages/core/src/ui/ui-json-schema.ts, packages/react/src/expose-component.fn.ts, packages/angular/src/utils/expose-component.fn.ts.
  'concept-trusted-components': {
    kind: 'architecture',
    title: 'The model selects; your components render',
    caption:
      'Expose a controlled catalog and prop schemas. Rendering and event handlers remain application code.',
    description:
      'The application catalog describes allowed components and their prop schemas to the model. Model output selects a component and supplies props. Hashbrown resolves that tree against the catalog, then the application renders its own component.',
    width: 1074,
    height: 465,
    nodes: [
      {
        id: 'catalog',
        x: 24,
        y: 24,
        width: 270,
        title: 'Component catalog',
        detail: 'Names and prop schemas',
      },
      {
        id: 'model',
        x: 420,
        y: 24,
        width: 250,
        title: 'Model',
        detail: 'Select from the catalog',
      },
      {
        id: 'tree',
        x: 420,
        y: 245,
        width: 250,
        title: 'Structured UI tree',
        detail: 'Component names and props',
      },
      {
        id: 'render',
        x: 800,
        y: 245,
        width: 250,
        title: 'Application renderer',
        detail: 'Your components and events',
      },
    ],
    edges: [
      {
        from: 'catalog',
        to: 'model',
        points: [
          [294, 84],
          [420, 84],
        ],
        label: {
          text: 'describe',
          x: 357,
          y: 65,
        },
      },
      {
        from: 'model',
        to: 'tree',
        points: [
          [545, 118],
          [545, 245],
        ],
        label: {
          text: 'output',
          x: 590,
          y: 198,
        },
      },
      {
        from: 'tree',
        to: 'render',
        points: [
          [670, 305],
          [800, 305],
        ],
        label: {
          text: 'resolve',
          x: 735,
          y: 286,
        },
      },
      {
        from: 'catalog',
        to: 'render',
        points: [
          [160, 118],
          [160, 432],
          [925, 432],
          [925, 361],
        ],
        label: {
          text: 'trusted implementations',
          x: 520,
          y: 413,
        },
      },
    ],
  },
  // Sources: packages/core/src/utils/resolve-with-schema.ts, packages/react/src/hooks/use-structured-chat.tsx, packages/angular/src/resources/structured-chat-resource.fn.ts.
  'concept-structured-contract': {
    kind: 'architecture',
    title: 'Typed output is input to application review',
    caption:
      'The parser resolves data with the schema. Your application decides whether the completed result is useful.',
    description:
      'A response schema and streamed model text both feed the parser. The parser yields typed values for application display and review. Completion and domain checks remain separate from parsing.',
    width: 1074,
    height: 425,
    nodes: [
      {
        id: 'schema',
        x: 24,
        y: 24,
        width: 250,
        title: 'Response schema',
        detail: 'Expected shape',
      },
      {
        id: 'text',
        x: 24,
        y: 265,
        width: 250,
        title: 'Model response',
        detail: 'Arriving JSON text',
      },
      {
        id: 'parser',
        x: 420,
        y: 145,
        width: 250,
        title: 'Hashbrown parser',
        detail: 'Resolve with the schema',
      },
      {
        id: 'review',
        x: 800,
        y: 145,
        width: 250,
        title: 'Application review',
        detail: 'Display typed values; check use',
      },
    ],
    edges: [
      {
        from: 'schema',
        to: 'parser',
        points: [
          [274, 84],
          [340, 84],
          [340, 190],
          [420, 190],
        ],
      },
      {
        from: 'text',
        to: 'parser',
        points: [
          [274, 325],
          [365, 325],
          [365, 215],
          [420, 215],
        ],
      },
      {
        from: 'parser',
        to: 'review',
        points: [
          [670, 205],
          [800, 205],
        ],
      },
    ],
  },
  // Sources: packages/core/src/schema/streaming.ts, packages/core/src/reducers/streaming-message.reducer.ts, packages/core/src/reducers/agent-state.reducer.ts.
  'concept-streaming-boundaries': {
    kind: 'flow',
    title: 'A preview can arrive before a run succeeds',
    caption:
      'Schema boundaries control what appears early. A visible value is still a preview until the run and application checks finish.',
    description:
      'Provider text chunks feed incremental parsing and typed previews. The run can later finish or fail. Successful completion still needs finish-reason and domain checks before application use; errors leave the previous application value in place.',
    width: 1010,
    height: 570,
    nodes: [
      {
        id: 'chunks',
        x: 24,
        y: 35,
        width: 230,
        title: 'Text chunks',
        detail: 'Arbitrary network boundaries',
      },
      {
        id: 'parse',
        x: 360,
        y: 35,
        width: 250,
        title: 'Schema resolution',
        detail: 'Growing strings; resolved items',
      },
      {
        id: 'preview',
        x: 735,
        y: 35,
        width: 250,
        title: 'Typed preview',
        detail: 'Render partial values',
      },
      {
        id: 'terminal',
        x: 360,
        y: 270,
        width: 250,
        title: 'Terminal event',
        detail: 'Inspect the run outcome',
      },
      {
        id: 'check',
        x: 735,
        y: 230,
        width: 250,
        title: 'Finished run',
        detail: 'Check reason and domain rules',
      },
      {
        id: 'error',
        x: 735,
        y: 410,
        width: 250,
        title: 'Failed run',
        detail: 'Keep prior application value',
      },
    ],
    edges: [
      {
        from: 'chunks',
        to: 'parse',
        points: [
          [254, 95],
          [360, 95],
        ],
      },
      {
        from: 'parse',
        to: 'preview',
        points: [
          [610, 95],
          [735, 95],
        ],
      },
      {
        from: 'chunks',
        to: 'terminal',
        points: [
          [139, 151],
          [139, 330],
          [360, 330],
        ],
      },
      {
        from: 'terminal',
        to: 'check',
        points: [
          [610, 315],
          [670, 315],
          [670, 290],
          [735, 290],
        ],
        label: {
          text: 'finished',
          x: 675,
          y: 267,
        },
      },
      {
        from: 'terminal',
        to: 'error',
        points: [
          [610, 345],
          [650, 345],
          [650, 470],
          [735, 470],
        ],
        label: {
          text: 'error',
          x: 677,
          y: 451,
        },
      },
    ],
  },
  // Sources: packages/core/src/decision/decision-runtime.ts, packages/core/src/decision/decidable-schema.ts, www/examples/quickstart/runtime/workbench.ts.
  'concept-decision-choices': {
    kind: 'flow',
    title: 'Define the choices before asking the model',
    caption:
      'A typed choice suggests a path. Your code decides what that path permits.',
    description:
      'An application defines distinct allowed choices, including clarification for insufficient context. The model interprets the input and returns a typed choice with metadata. Application policy routes a useful choice or asks a person for clarification.',
    width: 1094,
    height: 435,
    nodes: [
      {
        id: 'choices',
        x: 24,
        y: 35,
        width: 260,
        title: 'Allowed choices',
        detail: 'Distinct meanings and fallback',
      },
      {
        id: 'decision',
        x: 420,
        y: 150,
        width: 260,
        title: 'Typed decision',
        detail: 'Choice and metadata',
      },
      {
        id: 'input',
        x: 24,
        y: 275,
        width: 260,
        title: 'Current input',
        detail: 'Language and task context',
      },
      {
        id: 'route',
        x: 820,
        y: 35,
        width: 250,
        title: 'Suggested path',
        detail: 'Apply application policy',
      },
      {
        id: 'clarify',
        x: 820,
        y: 275,
        width: 250,
        title: 'Clarification',
        detail: 'Ask for missing information',
      },
    ],
    edges: [
      {
        from: 'choices',
        to: 'decision',
        points: [
          [284, 95],
          [350, 95],
          [350, 195],
          [420, 195],
        ],
      },
      {
        from: 'input',
        to: 'decision',
        points: [
          [284, 335],
          [370, 335],
          [370, 220],
          [420, 220],
        ],
      },
      {
        from: 'decision',
        to: 'route',
        points: [
          [680, 195],
          [740, 195],
          [740, 95],
          [820, 95],
        ],
        label: {
          text: 'known path',
          x: 754,
          y: 75,
        },
      },
      {
        from: 'decision',
        to: 'clarify',
        points: [
          [680, 220],
          [760, 220],
          [760, 335],
          [820, 335],
        ],
        label: {
          text: 'clarify',
          x: 757,
          y: 315,
        },
      },
    ],
  },
  // Sources: packages/openai/src/stream/text.fn.ts, packages/core/src/chat-runtime.ts, packages/core/src/models/run-finish.ts.
  'concept-debug-terminal': {
    kind: 'flow',
    title: 'HTTP success and run completion are separate checks',
    caption:
      'Inspect the stream and its terminal event, then check the finish reason and application result.',
    description:
      'HTTP 200 means the event stream began. That stream can end with RUN_ERROR or RUN_FINISHED. A finished run may still have a length, refusal, or other finish reason that leaves the feature unsatisfied.',
    width: 1080,
    height: 460,
    nodes: [
      {
        id: 'http',
        x: 24,
        y: 180,
        width: 250,
        title: 'HTTP 200',
        detail: 'Stream started',
      },
      {
        id: 'stream',
        x: 405,
        y: 180,
        width: 250,
        title: 'Event stream',
        detail: 'Inspect terminal evidence',
      },
      {
        id: 'error',
        x: 795,
        y: 30,
        width: 260,
        title: 'RUN_ERROR',
        detail: 'Investigate failing boundary',
      },
      {
        id: 'finish',
        x: 795,
        y: 300,
        width: 260,
        title: 'RUN_FINISHED',
        detail: 'Inspect finish reason and result',
      },
    ],
    edges: [
      {
        from: 'http',
        to: 'stream',
        points: [
          [274, 240],
          [405, 240],
        ],
      },
      {
        from: 'stream',
        to: 'error',
        points: [
          [655, 225],
          [720, 225],
          [720, 90],
          [795, 90],
        ],
      },
      {
        from: 'stream',
        to: 'finish',
        points: [
          [655, 250],
          [740, 250],
          [740, 360],
          [795, 360],
        ],
      },
    ],
  },
  // Sources: www/examples/quickstart/server/workbench-openai.ts, www/examples/quickstart/runtime/workbench-onboarding.ts.
  'concept-system-policy': {
    kind: 'architecture',
    title: 'The endpoint owns trusted policy',
    caption:
      'System instructions guide the model. Code enforces authentication, authorization, and validation.',
    description:
      'The browser sends a user request and feature guidance to the endpoint. The endpoint combines the validated request with its own trusted policy before calling the provider. The endpoint must enforce access checks independently of model instructions.',
    width: 1104,
    height: 445,
    nodes: [
      {
        id: 'browser',
        x: 24,
        y: 35,
        width: 260,
        title: 'Browser request',
        detail: 'User message and feature guidance',
      },
      {
        id: 'policy',
        x: 24,
        y: 285,
        width: 260,
        title: 'Server-owned policy',
        detail: 'Trusted task instructions',
      },
      {
        id: 'endpoint',
        x: 440,
        y: 160,
        width: 260,
        title: 'Endpoint',
        detail: 'Validate; apply trusted policy',
      },
      {
        id: 'provider',
        x: 830,
        y: 160,
        width: 250,
        title: 'Provider',
        detail: 'Effective model instructions',
      },
    ],
    edges: [
      {
        from: 'browser',
        to: 'endpoint',
        points: [
          [284, 95],
          [350, 95],
          [350, 205],
          [440, 205],
        ],
      },
      {
        from: 'policy',
        to: 'endpoint',
        points: [
          [284, 345],
          [375, 345],
          [375, 230],
          [440, 230],
        ],
      },
      {
        from: 'endpoint',
        to: 'provider',
        points: [
          [700, 220],
          [830, 220],
        ],
      },
    ],
  },
  // Sources: packages/openai/src/stream/text.fn.ts, packages/openai/src/stream/openai-request.ts, www/examples/quickstart/server/workbench-transform.ts.
  'concept-provider-transform': {
    kind: 'sequence',
    title: 'Transform after mapping, before sending',
    caption:
      'Return the complete provider options. Preserve the mapped messages, tools, and response format you still need.',
    description:
      'The endpoint gives a Hashbrown request to its provider adapter. The adapter maps it into provider-native options, awaits the transform callback, and sends the returned complete options to the provider.',
    participants: [
      {
        id: 'endpoint',
        title: 'Endpoint',
      },
      {
        id: 'adapter',
        title: 'Provider adapter',
      },
      {
        id: 'hook',
        title: 'Transform callback',
      },
      {
        id: 'provider',
        title: 'Provider',
      },
    ],
    messages: [
      {
        from: 'endpoint',
        to: 'adapter',
        label: 'Validated Hashbrown request',
      },
      {
        from: 'adapter',
        to: 'hook',
        label: 'Mapped provider-native options',
      },
      {
        from: 'hook',
        to: 'adapter',
        label: 'Complete transformed options',
      },
      {
        from: 'adapter',
        to: 'provider',
        label: 'Send transformed request',
      },
      {
        from: 'provider',
        to: 'adapter',
        label: 'Stream provider output',
      },
    ],
  },
};
