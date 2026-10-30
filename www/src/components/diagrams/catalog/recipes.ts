import type { DiagramDefinition } from '../diagram-types';

/** Recipe diagrams share contracts across frameworks while preserving runtime ownership. */
export const RECIPE_DIAGRAM_DEFINITIONS: Record<string, DiagramDefinition> = {
  // Evidence: www/examples/quickstart/runtime/workbench-history.ts; www/examples/quickstart/runtime/workbench-history-client.ts; both HistoryWorkbench clients.
  'recipe-browser-text-round-trip': {
    kind: 'sequence',
    title: 'Save text, then load it deliberately',
    caption:
      'Save keeps a completed text copy. Load replaces an idle conversation; the next user message starts a request.',
    description:
      'The browser application validates completed user and assistant text before explicitly saving a versioned document to local storage. After refresh, an explicit load reads and validates the document, then replaces idle SDK history. Loading sends no model request. An explicit follow-up starts a fresh run using that restored text. This format does not preserve tool calls or a paused agent checkpoint.',
    participants: [
      {
        id: 'app',
        title: 'Browser app',
      },
      {
        id: 'storage',
        title: 'Local storage',
      },
      {
        id: 'chat',
        title: 'Chat runtime',
      },
    ],
    messages: [
      {
        from: 'chat',
        to: 'app',
        label: 'Completed text',
        dashed: true,
      },
      {
        from: 'app',
        to: 'storage',
        label: 'Save validated text',
      },
      {
        from: 'storage',
        to: 'app',
        label: 'Load and validate',
        dashed: true,
      },
      {
        from: 'app',
        to: 'chat',
        label: 'Replace idle history',
      },
      {
        from: 'app',
        to: 'chat',
        label: 'Send follow-up',
      },
    ],
  },
  // Evidence: www/examples/quickstart/server/thread-app.ts; www/examples/quickstart/server/thread-store.ts; www/examples/quickstart/runtime/workbench-server-history.ts.
  'recipe-thread-version-conflict': {
    kind: 'sequence',
    title: 'A version makes a competing save visible',
    caption:
      'Both clients loaded version 4. The first save advances the record; the second gets a conflict and keeps its unsaved text.',
    description:
      'Two authenticated clients have loaded the same owner-scoped completed-text record at version 4. Client A saves with expected version 4 and the atomic repository returns version 5. Client B still submits expected version 4, so its save receives HTTP 409. Client B keeps its unsaved text and can explicitly reload version 5. The example repository is in process memory, not durable agent storage.',
    participants: [
      {
        id: 'a',
        title: 'Client A',
      },
      {
        id: 'store',
        title: 'Owner-scoped store',
      },
      {
        id: 'b',
        title: 'Client B',
      },
    ],
    messages: [
      {
        from: 'a',
        to: 'store',
        label: 'Save: expect 4',
      },
      {
        from: 'store',
        to: 'a',
        label: 'Saved: version 5',
        dashed: true,
      },
      {
        from: 'b',
        to: 'store',
        label: 'Save: expect 4',
      },
      {
        from: 'store',
        to: 'b',
        label: '409: keep draft',
        dashed: true,
      },
      {
        from: 'b',
        to: 'store',
        label: 'Explicit reload',
      },
      {
        from: 'store',
        to: 'b',
        label: 'Load version 5',
        dashed: true,
      },
    ],
  },
  // Evidence: www/examples/quickstart/server/workbench-agent.ts; www/examples/quickstart/server/agent-routing.ts; supportReply helper in both recipe pages.
  'recipe-decision-routing': {
    kind: 'flow',
    title: 'Validate a decision before choosing a handler',
    caption:
      'The model proposes a route. Server policy decides whether a known handler can answer or clarification is needed.',
    description:
      'A TypeSafe envelope is decoded against a closed schema on the server. A valid known non-clarification route with finite confidence at or above the configured threshold selects a fixed read-only handler. Invalid envelopes, low confidence, explicit clarification, or an operationally unavailable classifier produce clarification. Cancellation suppresses late output; unexpected programming errors remain errors.',
    width: 1100,
    height: 510,
    nodes: [
      {
        id: 'decision',
        x: 24,
        y: 60,
        width: 240,
        title: 'Decision envelope',
        detail: 'Closed route schema',
      },
      {
        id: 'policy',
        x: 414,
        y: 60,
        width: 240,
        title: 'Decode and check',
        detail: 'Known route, finite score',
        accent: true,
      },
      {
        id: 'handler',
        x: 814,
        y: 60,
        width: 240,
        title: 'Read-only handler',
        detail: 'Fixed application reply',
      },
      {
        id: 'clarify',
        x: 414,
        y: 305,
        width: 240,
        title: 'Ask for clarification',
        detail: 'Invalid, low, or clarify',
      },
    ],
    edges: [
      {
        from: 'decision',
        to: 'policy',
      },
      {
        from: 'policy',
        to: 'handler',
        label: {
          text: 'passes policy',
          x: 734,
          y: 94,
        },
      },
      {
        from: 'policy',
        to: 'clarify',
        label: {
          text: 'fallback',
          x: 594,
          y: 264,
        },
      },
    ],
  },
  // Evidence: www/examples/quickstart/runtime/workbench-authoring.ts: decodeWorkbenchAuthoringDocument; both AuthoringWorkbench clients; shopping preview helper in both recipe pages.
  'recipe-parser-preview-validation': {
    kind: 'architecture',
    title: 'Preview and validation read the same source',
    caption:
      'A useful partial value helps the reader. Only the original completed document can pass the final application checks.',
    description:
      'The accumulated original JSON feeds two paths. The incremental parser resolves fields for a live preview. Separately, successful source completion permits parsing and validating the original full document against application rules. A resolved preview or a closed JSON root alone does not establish successful completion. The parser workbench never applies the plan.',
    width: 1100,
    height: 540,
    nodes: [
      {
        id: 'source',
        x: 24,
        y: 180,
        width: 240,
        title: 'Original JSON',
        detail: 'Full string so far',
      },
      {
        id: 'parser',
        x: 414,
        y: 40,
        width: 240,
        title: 'Incremental parser',
        detail: 'Resolve partial values',
      },
      {
        id: 'preview',
        x: 814,
        y: 40,
        width: 240,
        title: 'Live preview',
        detail: 'May be incomplete',
      },
      {
        id: 'validate',
        x: 414,
        y: 320,
        width: 240,
        title: 'Final validation',
        detail: 'Successful source + original JSON',
        accent: true,
      },
      {
        id: 'valid',
        x: 814,
        y: 320,
        width: 240,
        title: 'Validated document',
        detail: 'Application rules pass',
      },
    ],
    edges: [
      {
        from: 'source',
        to: 'parser',
      },
      {
        from: 'parser',
        to: 'preview',
      },
      {
        from: 'source',
        to: 'validate',
      },
      {
        from: 'validate',
        to: 'valid',
      },
    ],
  },
  // Evidence: TripDraft/TripDraft component and reviewTrip helper in both natural-language-to-structured-data pages; www/examples/quickstart/runtime/workbench-authoring.ts; www/examples/quickstart/runtime/workbench.ts: reviewAuthoring/applyAuthoring.
  'recipe-form-state-boundaries': {
    kind: 'state',
    title: 'Give the user a separate copy to edit',
    caption:
      'Generation updates a preview. Review copies a completed valid draft; Apply validates the edited copy and current source again.',
    description:
      'Generated preview, editable reviewed fields, and applied application state are separate values. Only a fresh successful completed and valid draft can be copied by the Review action. Editing changes that reviewed copy. Explicit Apply checks the edited values and source freshness before changing application state. New generation invalidates the old reviewed copy and does not silently overwrite user edits or submit a form.',
    width: 1100,
    height: 310,
    nodes: [
      {
        id: 'preview',
        x: 24,
        y: 96,
        width: 240,
        title: 'Generated preview',
        detail: 'Can change while streaming',
      },
      {
        id: 'review',
        x: 414,
        y: 96,
        width: 240,
        title: 'Reviewed fields',
        detail: 'User edits a separate copy',
        accent: true,
      },
      {
        id: 'applied',
        x: 814,
        y: 96,
        width: 240,
        title: 'Applied state',
        detail: 'Explicit application change',
      },
    ],
    edges: [
      {
        from: 'preview',
        to: 'review',
        label: {
          text: 'Review + validate',
          x: 339,
          y: 130,
        },
      },
      {
        from: 'review',
        to: 'applied',
        label: {
          text: 'Apply + recheck',
          x: 739,
          y: 130,
        },
      },
    ],
  },
  // Evidence: www/examples/quickstart/runtime/workbench-recipes.ts; www/examples/quickstart/runtime/workbench-recipe-view.ts: canUseWorkbenchRecipe; www/examples/quickstart/runtime/workbench.ts: acceptPrediction/dismissPrediction; both PredictionsWorkbench clients.
  'recipe-prediction-freshness': {
    kind: 'state',
    title: 'Suggestions belong to the snapshot that requested them',
    caption:
      'Accept rechecks the context and revision. A changed document makes earlier suggestions unavailable.',
    description:
      'An explicit request captures current application data, revision, and a fresh context ID. A completed valid response becomes a suggestion only for that snapshot. Accept rechecks successful completion, known action, context and revision before the browser application handler changes state. Dismiss hides a suggestion without changing application state. Changed context, cancellation, errors or replacement invalidate old suggestions; a fresh request is explicit.',
    width: 1100,
    height: 550,
    nodes: [
      {
        id: 'snapshot',
        x: 24,
        y: 70,
        width: 240,
        title: 'Request snapshot',
        detail: 'Data, revision, context ID',
      },
      {
        id: 'proposal',
        x: 414,
        y: 70,
        width: 240,
        title: 'Current suggestion',
        detail: 'Completed and validated',
      },
      {
        id: 'accept',
        x: 814,
        y: 70,
        width: 240,
        title: 'Accept in app',
        detail: 'Recheck, then update',
        accent: true,
      },
      {
        id: 'stale',
        x: 414,
        y: 340,
        width: 240,
        title: 'Unavailable',
        detail: 'Changed, stopped, or replaced',
      },
      {
        id: 'dismiss',
        x: 814,
        y: 340,
        width: 240,
        title: 'Dismiss',
        detail: 'Hide; state is unchanged',
      },
    ],
    edges: [
      {
        from: 'snapshot',
        to: 'proposal',
      },
      {
        from: 'proposal',
        to: 'accept',
        label: {
          text: 'explicit action',
          x: 734,
          y: 104,
        },
      },
      {
        from: 'proposal',
        to: 'stale',
        label: {
          text: 'invalidate',
          x: 592,
          y: 283,
        },
      },
      {
        points: [
          [654, 172],
          [734, 172],
          [734, 395],
          [814, 395],
        ],
        from: 'proposal',
        to: 'dismiss',
      },
    ],
  },
  // Evidence: www/examples/quickstart/runtime/workbench-recipes.ts; www/examples/quickstart/runtime/workbench.ts: applySelection/manualSelection; both SelectionWorkbench clients.
  'recipe-ui-selection-branches': {
    kind: 'flow',
    title: 'A model choice previews an application-owned view',
    caption:
      'The application supplies the components and their data. The user can commit a fresh confident choice or select a view manually.',
    description:
      'The model returns a candidate ID and confidence, not generated props. A supported choice passing the confidence policy can preview the corresponding application-owned element. The workbench Use view action rechecks freshness before committing the view. Manual choice remains available independently, cancels pending work, and commits the chosen application-owned view. Low confidence or failure preserves manual control. View selection does not authorize data access.',
    width: 1100,
    height: 550,
    nodes: [
      {
        id: 'decision',
        x: 24,
        y: 40,
        width: 240,
        title: 'Candidate decision',
        detail: 'Known ID + confidence',
      },
      {
        id: 'preview',
        x: 414,
        y: 40,
        width: 240,
        title: 'Preview known view',
        detail: 'Pass confidence policy',
      },
      {
        id: 'current',
        x: 814,
        y: 190,
        width: 240,
        title: 'Current app view',
        detail: 'Explicit browser action',
        accent: true,
      },
      {
        id: 'manual',
        x: 414,
        y: 340,
        width: 240,
        title: 'Manual choice',
        detail: 'Cancel pending selection',
      },
    ],
    edges: [
      {
        from: 'decision',
        to: 'preview',
        label: {
          text: 'passes policy',
          x: 338,
          y: 74,
        },
      },
      {
        from: 'preview',
        to: 'current',
        label: {
          text: 'Use view',
          x: 732,
          y: 153,
        },
      },
      {
        from: 'manual',
        to: 'current',
        label: {
          text: 'choose directly',
          x: 730,
          y: 370,
        },
      },
    ],
  },
  // Evidence: www/examples/quickstart/server/thread-app.ts: createThreadApp; www/examples/quickstart/server/thread-server.ts; provider helper in both public-endpoint pages.
  'recipe-public-endpoint-gates': {
    kind: 'flow',
    title: 'Check access before starting provider work',
    caption:
      'Reject failed checks before opening the stream. The server supplies provider policy and credentials after admission.',
    description:
      'The checked application endpoint authenticates the caller and verifies the exact Origin for mutations, validates bounded input, authorizes the requested thread through an owner-scoped read, then applies admission policy. Only accepted requests reach the provider composition with server-owned policy and credentials. A failed pre-stream check returns an HTTP error. Once headers are sent, failures use a terminal protocol error; disconnect cancels provider work.',
    width: 1100,
    height: 550,
    nodes: [
      {
        id: 'identity',
        x: 24,
        y: 40,
        width: 240,
        title: 'Identity + Origin',
        detail: 'Verified caller',
      },
      {
        id: 'input',
        x: 414,
        y: 40,
        width: 240,
        title: 'Bounded input',
        detail: 'Validate request shape',
      },
      {
        id: 'owner',
        x: 814,
        y: 40,
        width: 240,
        title: 'Thread ownership',
        detail: 'Owner-scoped read',
      },
      {
        id: 'admission',
        x: 814,
        y: 330,
        width: 240,
        title: 'Admission',
        detail: 'Reserve allowed work',
      },
      {
        id: 'provider',
        x: 414,
        y: 330,
        width: 240,
        title: 'Provider stream',
        detail: 'Server policy and key',
        accent: true,
      },
      {
        id: 'reject',
        x: 24,
        y: 330,
        width: 240,
        title: 'Any gate can reject',
        detail: 'HTTP error before headers',
      },
    ],
    edges: [
      {
        from: 'identity',
        to: 'input',
      },
      {
        from: 'input',
        to: 'owner',
      },
      {
        from: 'owner',
        to: 'admission',
      },
      {
        from: 'admission',
        to: 'provider',
        label: {
          text: 'allowed',
          x: 734,
          y: 364,
        },
      },
      {
        from: 'identity',
        to: 'reject',
        label: {
          text: 'failed check',
          x: 200,
          y: 268,
        },
      },
      {
        dashed: true,
        points: [
          [534, 134],
          [534, 220],
          [144, 220],
          [144, 330],
        ],
        from: 'input',
        to: 'reject',
      },
      {
        from: 'owner',
        to: 'reject',
        dashed: true,
        points: [
          [934, 40],
          [934, 16],
          [8, 16],
          [8, 388],
          [24, 388],
        ],
        label: { text: 'ownership denied', x: 534, y: 31 },
      },
      {
        from: 'admission',
        to: 'reject',
        dashed: true,
        points: [
          [934, 424],
          [934, 500],
          [144, 500],
          [144, 446],
        ],
        label: { text: 'admission denied', x: 534, y: 526 },
      },
    ],
  },
  // Evidence: both ui-chatbot recipe DeliveryAssistant implementations; www/examples/quickstart/runtime/workbench-ui-kits.ts; both UiKitWorkbench clients; www/examples/quickstart/runtime/workbench-view.ts: canAcceptSummary.
  'recipe-ui-conversation-ownership': {
    kind: 'architecture',
    title: 'Rendering a proposal and accepting it are separate steps',
    caption:
      'The model supplies a component name and props. Your application owns the renderer and any action that follows.',
    description:
      'The application exposes trusted component contracts. Model output chooses one of those components and supplies schema-constrained props. Hashbrown resolves those props for the application-owned renderer. A read-only card displays information without changing application data. If a later card offers acceptance, a separate application handler checks completion, current data, and permission before applying a proposal. Rendering alone never accepts it.',
    width: 1100,
    height: 550,
    nodes: [
      {
        id: 'catalog',
        x: 24,
        y: 60,
        width: 240,
        title: 'Trusted catalog',
        detail: 'Components + prop schemas',
      },
      {
        id: 'model',
        x: 414,
        y: 60,
        width: 240,
        title: 'Model response',
        detail: 'Component name + props',
      },
      {
        id: 'render',
        x: 814,
        y: 60,
        width: 240,
        title: 'Your component',
        detail: 'Read-only presentation',
      },
      {
        id: 'action',
        x: 814,
        y: 340,
        width: 240,
        title: 'Application action',
        detail: 'Explicit acceptance + checks',
        accent: true,
      },
    ],
    edges: [
      {
        from: 'catalog',
        to: 'model',
      },
      {
        from: 'model',
        to: 'render',
      },
      {
        dashed: true,
        from: 'render',
        to: 'action',
        label: {
          text: 'optional action',
          x: 994,
          y: 278,
        },
      },
    ],
  },
  // Evidence: both magic-text recipe examples; www/examples/quickstart/react/src/MagicTextWorkbench.tsx; www/examples/quickstart/angular/src/app/magic-text-workbench.ts.
  'recipe-markdown-finalization': {
    kind: 'flow',
    title: 'Finish formatting even when generation stops early',
    caption:
      'isComplete finalizes Markdown parsing. Keep the request outcome visible beside the resulting text.',
    description:
      'The conversation runtime supplies the growing original assistant text to the Markdown renderer. When the run stops producing text, including cancellation or failure, isComplete finalizes Markdown parsing. Separately, the SDK lifecycle determines whether the run succeeded, stopped, or failed. Finalized formatting does not prove successful generation, citation accuracy, or permission for an application action.',
    width: 1100,
    height: 550,
    nodes: [
      {
        id: 'run',
        x: 24,
        y: 170,
        width: 240,
        title: 'Conversation runtime',
        detail: 'Original assistant text',
      },
      {
        id: 'render',
        x: 414,
        y: 40,
        width: 240,
        title: 'Markdown renderer',
        detail: 'Format the growing string',
      },
      {
        id: 'final',
        x: 814,
        y: 40,
        width: 240,
        title: 'Finalize parsing',
        detail: 'isComplete when text ends',
      },
      {
        id: 'outcome',
        x: 414,
        y: 330,
        width: 240,
        title: 'Request outcome',
        detail: 'Success, stopped, or failed',
        accent: true,
      },
    ],
    edges: [
      {
        from: 'run',
        to: 'render',
      },
      {
        from: 'render',
        to: 'final',
      },
      {
        from: 'run',
        to: 'outcome',
      },
    ],
  },
  // Evidence: www/examples/quickstart/runtime/local-models.ts: prepareLocalModel; www/examples/quickstart/runtime/workbench-local-controls.ts; www/examples/quickstart/runtime/workbench-local-models.ts.
  'recipe-native-model-preparation': {
    kind: 'state',
    title: 'Preparation and generation have different lifetimes',
    caption:
      'Check the device, prepare explicitly when needed, then generate locally. Unavailable models leave generation disabled.',
    description:
      'An explicit Prepare action checks the native browser model capability. An already available model becomes ready without opening a preparation session. Downloadable or downloading availability opens a temporary preparation session and reports progress; the helper destroys that session when preparation settles. Unavailable capability or preparation failure leaves generation disabled. Stop cancels preparation and late sessions are destroyed. Generation is a separate local transport request after readiness, with completion and data validation still required.',
    width: 1100,
    height: 550,
    nodes: [
      {
        id: 'check',
        x: 24,
        y: 60,
        width: 240,
        title: 'Check capability',
        detail: 'Explicit Prepare action',
      },
      {
        id: 'prepare',
        x: 414,
        y: 60,
        width: 240,
        title: 'Prepare model',
        detail: 'Download progress',
      },
      {
        id: 'ready',
        x: 814,
        y: 60,
        width: 240,
        title: 'Ready locally',
        detail: 'Generation may begin',
        accent: true,
      },
      {
        id: 'disabled',
        x: 414,
        y: 340,
        width: 240,
        title: 'Generation disabled',
        detail: 'Unavailable, failed, or stopped',
      },
    ],
    edges: [
      {
        from: 'check',
        to: 'prepare',
        label: {
          text: 'needs model',
          x: 338,
          y: 94,
        },
      },
      {
        from: 'prepare',
        to: 'ready',
        label: {
          text: 'prepared',
          x: 734,
          y: 94,
        },
      },
      {
        points: [
          [144, 60],
          [144, 30],
          [934, 30],
          [934, 60],
        ],
        from: 'check',
        to: 'ready',
        label: {
          text: 'already available',
          x: 534,
          y: 23,
        },
      },
      {
        from: 'prepare',
        to: 'disabled',
        label: {
          text: 'failure / Stop',
          x: 598,
          y: 282,
        },
      },
      {
        points: [
          [144, 162],
          [144, 397],
          [414, 397],
        ],
        from: 'check',
        to: 'disabled',
      },
    ],
  },
  // Evidence: www/examples/threadplane-consumers/angular/src/app/threadplane-chat.ts; www/examples/threadplane-consumers/server/threadplane-app.ts.
  'recipe-threadplane-angular': {
    kind: 'architecture',
    title: 'Who owns the Angular conversation?',
    caption:
      'Threadplane owns the Angular frontend runtime. The Hashbrown server streams AG-UI events.',
    description:
      'Threadplane ChatComponent uses the agent created by provideAgent in the browser. That Threadplane AG-UI agent sends requests to the application endpoint and consumes streamed AG-UI events from the Hashbrown server adapter. No Hashbrown chatResource is created for this screen. Server credentials and model policy remain at the endpoint.',
    width: 1100,
    height: 350,
    nodes: [
      {
        id: 'presentation',
        x: 24,
        y: 90,
        width: 240,
        title: 'Threadplane UI',
        detail: 'ChatComponent',
      },
      {
        id: 'runtime',
        x: 414,
        y: 90,
        width: 240,
        title: 'Threadplane agent',
        detail: 'provideAgent / injectAgent',
        accent: true,
      },
      {
        id: 'server',
        x: 814,
        y: 90,
        width: 240,
        title: 'Hashbrown server',
        detail: 'Policy + provider adapter',
      },
    ],
    edges: [
      {
        from: 'presentation',
        to: 'runtime',
        label: {
          text: 'controls',
          x: 337,
          y: 123,
        },
      },
      {
        from: 'runtime',
        to: 'server',
        label: {
          text: 'AG-UI request',
          x: 736,
          y: 123,
        },
      },
      {
        dashed: true,
        points: [
          [814, 195],
          [654, 195],
        ],
        from: 'server',
        to: 'runtime',
        label: {
          text: 'events',
          x: 736,
          y: 199,
        },
      },
      {
        dashed: true,
        points: [
          [414, 195],
          [264, 195],
        ],
        from: 'runtime',
        to: 'presentation',
        label: {
          text: 'text + status',
          x: 337,
          y: 199,
        },
      },
    ],
  },
  // Evidence: www/examples/threadplane-consumers/react/src/ThreadplaneChat.tsx; www/examples/threadplane-consumers/server/threadplane-app.ts.
  'recipe-threadplane-react': {
    kind: 'architecture',
    title: 'Who owns the React conversation?',
    caption:
      'Hashbrown owns the React conversation. Threadplane presents its text and Send and Stop controls.',
    description:
      'Threadplane ChatInput invokes sendMessage and stop on the Hashbrown useChat runtime. TextTranscript receives projected text messages from that runtime. useChat communicates with the application endpoint and consumes streamed AG-UI events from the Hashbrown server adapter. Threadplane supplies presentation; Hashbrown owns this React conversation runtime. Credentials and trusted policy remain on the server.',
    width: 1100,
    height: 350,
    nodes: [
      {
        id: 'presentation',
        x: 24,
        y: 90,
        width: 240,
        title: 'Threadplane UI',
        detail: 'ChatInput + TextTranscript',
      },
      {
        id: 'runtime',
        x: 414,
        y: 90,
        width: 240,
        title: 'Hashbrown useChat',
        detail: 'Messages, Send, Stop',
        accent: true,
      },
      {
        id: 'server',
        x: 814,
        y: 90,
        width: 240,
        title: 'Hashbrown server',
        detail: 'Policy + provider adapter',
      },
    ],
    edges: [
      {
        from: 'presentation',
        to: 'runtime',
        label: {
          text: 'controls',
          x: 337,
          y: 123,
        },
      },
      {
        from: 'runtime',
        to: 'server',
        label: {
          text: 'AG-UI request',
          x: 736,
          y: 123,
        },
      },
      {
        dashed: true,
        points: [
          [814, 195],
          [654, 195],
        ],
        from: 'server',
        to: 'runtime',
        label: {
          text: 'events',
          x: 736,
          y: 199,
        },
      },
      {
        dashed: true,
        points: [
          [414, 195],
          [264, 195],
        ],
        from: 'runtime',
        to: 'presentation',
        label: {
          text: 'text + status',
          x: 337,
          y: 199,
        },
      },
    ],
  },
};
