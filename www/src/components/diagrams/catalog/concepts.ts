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
        label: 'Start a user turn',
      },
      {
        from: 'client',
        to: 'model',
        label: 'Request 1: history',
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
        label: 'Return tool result',
      },
      {
        from: 'client',
        to: 'model',
        label: 'Request 2: add result',
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
        label: 'History and tools',
      },
      {
        from: 'model',
        to: 'client',
        label: 'Tool name and arguments',
      },
      {
        from: 'client',
        to: 'handler',
        label: 'Run registered handler',
      },
      {
        from: 'handler',
        to: 'client',
        label: 'Result or error',
      },
      {
        from: 'client',
        to: 'model',
        label: 'Continue with result',
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
    width: 720,
    height: 550,
    nodes: [
      {
        id: 'work',
        x: 224,
        y: 24,
        width: 280,
        title: 'Agent work',
        detail: 'Report stages as they occur',
      },
      {
        id: 'activity',
        x: 24,
        y: 220,
        width: 280,
        title: 'Activity event',
        detail: 'Snapshot, then deltas',
      },
      {
        id: 'tool',
        x: 414,
        y: 220,
        width: 280,
        title: 'Tool result',
        detail: 'Data needed to continue',
      },
      {
        id: 'ui',
        x: 24,
        y: 416,
        width: 280,
        title: 'Progress UI',
        detail: 'Display-only messages',
      },
      {
        id: 'model',
        x: 414,
        y: 416,
        width: 280,
        title: 'Model',
        detail: 'Next request context',
      },
    ],
    edges: [
      {
        from: 'work',
        to: 'activity',
        points: [
          [304, 140],
          [304, 178],
          [164, 178],
          [164, 220],
        ],
      },
      {
        from: 'work',
        to: 'tool',
        points: [
          [424, 140],
          [424, 178],
          [554, 178],
          [554, 220],
        ],
      },
      {
        from: 'activity',
        to: 'ui',
      },
      {
        from: 'tool',
        to: 'model',
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
        label: 'Pause: pending interrupts',
      },
      {
        from: 'client',
        to: 'person',
        label: 'Show questions or approval',
      },
      {
        from: 'person',
        to: 'client',
        label: 'Answer pending questions',
      },
      {
        from: 'client',
        to: 'agent',
        label: 'Resume: complete batch',
      },
      {
        from: 'agent',
        to: 'client',
        label: 'Check; continue or decline',
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
        label: 'History and JSON state',
      },
      {
        from: 'agent',
        to: 'model',
        label: 'Validated state to context',
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
        label: 'Success commits draft',
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
        label: 'Evaluate in fresh context',
      },
      {
        from: 'js',
        to: 'host',
        label: 'Call exposed capability',
      },
      {
        from: 'host',
        to: 'js',
        label: 'Validate; return data',
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
    width: 720,
    height: 550,
    nodes: [
      {
        id: 'schema',
        x: 224,
        y: 24,
        width: 280,
        title: 'Skillet schema',
        detail: 'Fields, types, descriptions',
      },
      {
        id: 'tool',
        x: 24,
        y: 220,
        width: 280,
        title: 'Tool arguments',
        detail: 'Contract for a call',
      },
      {
        id: 'response',
        x: 414,
        y: 220,
        width: 280,
        title: 'Structured response',
        detail: 'Contract for returned data',
      },
      {
        id: 'props',
        x: 224,
        y: 416,
        width: 280,
        title: 'Component inputs',
        detail: 'Contract for generated props',
      },
    ],
    edges: [
      {
        from: 'schema',
        to: 'tool',
        points: [
          [304, 140],
          [304, 178],
          [164, 178],
          [164, 220],
        ],
      },
      {
        from: 'schema',
        to: 'response',
        points: [
          [424, 140],
          [424, 178],
          [554, 178],
          [554, 220],
        ],
      },
      {
        from: 'schema',
        to: 'props',
        points: [
          [364, 140],
          [364, 416],
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
    width: 720,
    height: 550,
    nodes: [
      {
        id: 'store',
        x: 24,
        y: 24,
        width: 280,
        title: 'Application storage',
        detail: 'Selected transcript',
      },
      {
        id: 'history',
        x: 24,
        y: 220,
        width: 280,
        title: 'Chat history',
        detail: 'Earlier messages',
      },
      {
        id: 'new',
        x: 414,
        y: 220,
        width: 280,
        title: 'New user message',
        detail: 'Current request',
      },
      {
        id: 'request',
        x: 224,
        y: 416,
        width: 280,
        title: 'Next model request',
        detail: 'History and current message',
      },
    ],
    edges: [
      {
        from: 'store',
        to: 'history',
        label: {
          text: 'load',
          x: 200,
          y: 178,
        },
      },
      {
        from: 'history',
        to: 'request',
        points: [
          [164, 314],
          [164, 374],
          [294, 374],
          [294, 416],
        ],
      },
      {
        from: 'new',
        to: 'request',
        points: [
          [554, 314],
          [554, 374],
          [434, 374],
          [434, 416],
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
    width: 720,
    height: 550,
    nodes: [
      {
        id: 'catalog',
        x: 24,
        y: 24,
        width: 280,
        title: 'Component catalog',
        detail: 'Names and prop schemas',
      },
      {
        id: 'model',
        x: 414,
        y: 24,
        width: 280,
        title: 'Model',
        detail: 'Select from the catalog',
      },
      {
        id: 'tree',
        x: 414,
        y: 220,
        width: 280,
        title: 'Structured UI tree',
        detail: 'Component names and props',
      },
      {
        id: 'render',
        x: 24,
        y: 416,
        width: 280,
        title: 'Application renderer',
        detail: 'Your components and events',
      },
    ],
    edges: [
      {
        from: 'catalog',
        to: 'model',
        label: {
          text: 'describe',
          x: 359,
          y: 54,
        },
      },
      {
        from: 'model',
        to: 'tree',
        label: {
          text: 'output',
          x: 600,
          y: 178,
        },
      },
      {
        from: 'tree',
        to: 'render',
        points: [
          [554, 314],
          [554, 374],
          [244, 374],
          [244, 416],
        ],
        label: {
          text: 'resolve',
          x: 450,
          y: 355,
        },
      },
      {
        from: 'catalog',
        to: 'render',
        label: {
          text: 'trusted code',
          x: 245,
          y: 355,
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
    width: 720,
    height: 550,
    nodes: [
      {
        id: 'schema',
        x: 24,
        y: 24,
        width: 280,
        title: 'Response schema',
        detail: 'Expected shape',
      },
      {
        id: 'text',
        x: 414,
        y: 24,
        width: 280,
        title: 'Model response',
        detail: 'Arriving JSON text',
      },
      {
        id: 'parser',
        x: 224,
        y: 220,
        width: 280,
        title: 'Hashbrown parser',
        detail: 'Resolve with the schema',
      },
      {
        id: 'review',
        x: 224,
        y: 416,
        width: 280,
        title: 'Application review',
        detail: 'Display typed values; check use',
      },
    ],
    edges: [
      {
        from: 'schema',
        to: 'parser',
        points: [
          [164, 118],
          [164, 178],
          [294, 178],
          [294, 220],
        ],
      },
      {
        from: 'text',
        to: 'parser',
        points: [
          [554, 118],
          [554, 178],
          [434, 178],
          [434, 220],
        ],
      },
      {
        from: 'parser',
        to: 'review',
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
    width: 720,
    height: 550,
    nodes: [
      {
        id: 'chunks',
        x: 24,
        y: 24,
        width: 280,
        title: 'Text chunks',
        detail: 'Arbitrary network boundaries',
      },
      {
        id: 'parse',
        x: 414,
        y: 24,
        width: 280,
        title: 'Schema resolution',
        detail: 'Growing strings; resolved items',
      },
      {
        id: 'preview',
        x: 414,
        y: 220,
        width: 280,
        title: 'Typed preview',
        detail: 'Render partial values',
      },
      {
        id: 'terminal',
        x: 24,
        y: 220,
        width: 280,
        title: 'Terminal event',
        detail: 'Inspect the run outcome',
      },
      {
        id: 'check',
        x: 24,
        y: 416,
        width: 280,
        title: 'Finished run',
        detail: 'Check reason and domain rules',
      },
      {
        id: 'error',
        x: 414,
        y: 416,
        width: 280,
        title: 'Failed run',
        detail: 'Keep prior application value',
      },
    ],
    edges: [
      {
        from: 'chunks',
        to: 'parse',
      },
      {
        from: 'parse',
        to: 'preview',
      },
      {
        from: 'chunks',
        to: 'terminal',
      },
      {
        from: 'terminal',
        to: 'check',
        label: {
          text: 'finished',
          x: 215,
          y: 380,
        },
      },
      {
        from: 'terminal',
        to: 'error',
        points: [
          [214, 314],
          [214, 374],
          [554, 374],
          [554, 416],
        ],
        label: {
          text: 'error',
          x: 620,
          y: 397,
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
    width: 720,
    height: 550,
    nodes: [
      {
        id: 'choices',
        x: 24,
        y: 24,
        width: 280,
        title: 'Allowed choices',
        detail: 'Distinct meanings and fallback',
      },
      {
        id: 'decision',
        x: 224,
        y: 220,
        width: 280,
        title: 'Typed decision',
        detail: 'Choice and metadata',
      },
      {
        id: 'input',
        x: 414,
        y: 24,
        width: 280,
        title: 'Current input',
        detail: 'Language and task context',
      },
      {
        id: 'route',
        x: 24,
        y: 416,
        width: 280,
        title: 'Suggested path',
        detail: 'Apply application policy',
      },
      {
        id: 'clarify',
        x: 414,
        y: 416,
        width: 280,
        title: 'Clarification',
        detail: 'Ask for missing information',
      },
    ],
    edges: [
      {
        from: 'choices',
        to: 'decision',
        points: [
          [164, 140],
          [164, 178],
          [294, 178],
          [294, 220],
        ],
      },
      {
        from: 'input',
        to: 'decision',
        points: [
          [554, 118],
          [554, 178],
          [434, 178],
          [434, 220],
        ],
      },
      {
        from: 'decision',
        to: 'route',
        points: [
          [304, 314],
          [304, 374],
          [164, 374],
          [164, 416],
        ],
        label: {
          text: 'known path',
          x: 240,
          y: 397,
        },
      },
      {
        from: 'decision',
        to: 'clarify',
        points: [
          [424, 314],
          [424, 374],
          [554, 374],
          [554, 416],
        ],
        label: {
          text: 'clarify',
          x: 620,
          y: 397,
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
    width: 720,
    height: 550,
    nodes: [
      {
        id: 'http',
        x: 224,
        y: 24,
        width: 280,
        title: 'HTTP 200',
        detail: 'Stream started',
      },
      {
        id: 'stream',
        x: 224,
        y: 220,
        width: 280,
        title: 'Event stream',
        detail: 'Inspect terminal evidence',
      },
      {
        id: 'error',
        x: 24,
        y: 416,
        width: 280,
        title: 'RUN_ERROR',
        detail: 'Investigate failing boundary',
      },
      {
        id: 'finish',
        x: 414,
        y: 416,
        width: 280,
        title: 'RUN_FINISHED',
        detail: 'Inspect finish reason and result',
      },
    ],
    edges: [
      {
        from: 'http',
        to: 'stream',
      },
      {
        from: 'stream',
        to: 'error',
        points: [
          [304, 314],
          [304, 374],
          [164, 374],
          [164, 416],
        ],
      },
      {
        from: 'stream',
        to: 'finish',
        points: [
          [424, 314],
          [424, 374],
          [554, 374],
          [554, 416],
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
    width: 720,
    height: 550,
    nodes: [
      {
        id: 'browser',
        x: 24,
        y: 24,
        width: 280,
        title: 'Browser request',
        detail: 'User message and feature guidance',
      },
      {
        id: 'policy',
        x: 414,
        y: 24,
        width: 280,
        title: 'Server-owned policy',
        detail: 'Trusted task instructions',
      },
      {
        id: 'endpoint',
        x: 224,
        y: 220,
        width: 280,
        title: 'Endpoint',
        detail: 'Validate; apply trusted policy',
      },
      {
        id: 'provider',
        x: 224,
        y: 416,
        width: 280,
        title: 'Provider',
        detail: 'Effective model instructions',
      },
    ],
    edges: [
      {
        from: 'browser',
        to: 'endpoint',
        points: [
          [164, 140],
          [164, 178],
          [294, 178],
          [294, 220],
        ],
      },
      {
        from: 'policy',
        to: 'endpoint',
        points: [
          [554, 118],
          [554, 178],
          [434, 178],
          [434, 220],
        ],
      },
      {
        from: 'endpoint',
        to: 'provider',
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
        label: 'Hashbrown request',
      },
      {
        from: 'adapter',
        to: 'hook',
        label: 'Mapped provider options',
      },
      {
        from: 'hook',
        to: 'adapter',
        label: 'Complete new options',
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
