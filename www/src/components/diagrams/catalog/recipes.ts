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
    width: 740,
    height: 610,
    nodes: [
      {
        id: 'decision',
        x: 230,
        y: 24,
        width: 280,
        title: 'Decision envelope',
        detail: 'Closed route schema',
      },
      {
        id: 'policy',
        x: 230,
        y: 220,
        width: 280,
        title: 'Decode and check',
        detail: 'Known route, finite score',
        accent: true,
      },
      {
        id: 'handler',
        x: 24,
        y: 450,
        width: 280,
        title: 'Read-only handler',
        detail: 'Fixed application reply',
      },
      {
        id: 'clarify',
        x: 436,
        y: 450,
        width: 280,
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
          x: 164,
          y: 375,
        },
        points: [
          [370, 314],
          [370, 390],
          [164, 390],
          [164, 450],
        ],
      },
      {
        from: 'policy',
        to: 'clarify',
        label: {
          text: 'fallback',
          x: 576,
          y: 375,
        },
        points: [
          [370, 314],
          [370, 390],
          [576, 390],
          [576, 450],
        ],
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
    width: 740,
    height: 620,
    nodes: [
      {
        id: 'source',
        x: 230,
        y: 24,
        width: 280,
        title: 'Original JSON',
        detail: 'Full string so far',
      },
      {
        id: 'parser',
        x: 24,
        y: 230,
        width: 280,
        title: 'Incremental parser',
        detail: 'Resolve partial values',
      },
      {
        id: 'preview',
        x: 24,
        y: 460,
        width: 280,
        title: 'Live preview',
        detail: 'May be incomplete',
      },
      {
        id: 'validate',
        x: 436,
        y: 230,
        width: 280,
        title: 'Final validation',
        detail: 'Successful source + original JSON',
        accent: true,
      },
      {
        id: 'valid',
        x: 436,
        y: 460,
        width: 280,
        title: 'Validated document',
        detail: 'Application rules pass',
      },
    ],
    edges: [
      {
        from: 'source',
        to: 'parser',
        points: [
          [370, 118],
          [370, 190],
          [164, 190],
          [164, 230],
        ],
      },
      {
        from: 'parser',
        to: 'preview',
      },
      {
        from: 'source',
        to: 'validate',
        points: [
          [370, 118],
          [370, 190],
          [576, 190],
          [576, 230],
        ],
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
    width: 740,
    height: 640,
    nodes: [
      {
        id: 'preview',
        x: 230,
        y: 24,
        width: 280,
        title: 'Generated preview',
        detail: 'Can change while streaming',
      },
      {
        id: 'review',
        x: 230,
        y: 260,
        width: 280,
        title: 'Reviewed fields',
        detail: 'Fresh valid copy; user edits',
        accent: true,
      },
      {
        id: 'applied',
        x: 230,
        y: 500,
        width: 280,
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
          x: 520,
          y: 209,
        },
      },
      {
        from: 'review',
        to: 'applied',
        label: {
          text: 'Apply + recheck',
          x: 520,
          y: 449,
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
    width: 740,
    height: 840,
    nodes: [
      {
        id: 'snapshot',
        x: 230,
        y: 24,
        width: 280,
        title: 'Request snapshot',
        detail: 'Data, revision, context ID',
      },
      {
        id: 'proposal',
        x: 230,
        y: 230,
        width: 280,
        title: 'Current suggestion',
        detail: 'Completed and validated',
      },
      {
        id: 'accept',
        x: 24,
        y: 460,
        width: 280,
        title: 'Accept in app',
        detail: 'Recheck, then update',
        accent: true,
      },
      {
        id: 'stale',
        x: 230,
        y: 700,
        width: 280,
        title: 'Unavailable',
        detail: 'Changed, stopped, or replaced',
      },
      {
        id: 'dismiss',
        x: 436,
        y: 460,
        width: 280,
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
          text: 'Accept',
          x: 164,
          y: 375,
        },
        points: [
          [370, 324],
          [370, 390],
          [164, 390],
          [164, 460],
        ],
      },
      {
        from: 'proposal',
        to: 'stale',
        label: {
          text: 'invalidate',
          x: 620,
          y: 670,
        },
        points: [
          [510, 277],
          [730, 277],
          [730, 650],
          [370, 650],
          [370, 700],
        ],
      },
      {
        from: 'proposal',
        to: 'dismiss',
        label: {
          text: 'Dismiss',
          x: 576,
          y: 375,
        },
        points: [
          [370, 324],
          [370, 390],
          [576, 390],
          [576, 460],
        ],
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
    width: 740,
    height: 640,
    nodes: [
      {
        id: 'decision',
        x: 24,
        y: 24,
        width: 280,
        title: 'Candidate decision',
        detail: 'Known ID + confidence',
      },
      {
        id: 'preview',
        x: 24,
        y: 260,
        width: 280,
        title: 'Preview known view',
        detail: 'Pass confidence policy',
      },
      {
        id: 'current',
        x: 436,
        y: 500,
        width: 280,
        title: 'Current app view',
        detail: 'Fresh Use view or manual choice',
        accent: true,
      },
      {
        id: 'manual',
        x: 436,
        y: 24,
        width: 280,
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
          x: 260,
          y: 209,
        },
      },
      {
        from: 'preview',
        to: 'current',
        label: {
          text: 'Use view',
          x: 390,
          y: 449,
        },
        points: [
          [304, 307],
          [330, 307],
          [330, 558],
          [436, 558],
        ],
      },
      {
        from: 'manual',
        to: 'current',
        label: {
          text: 'Choose',
          x: 640,
          y: 330,
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
    width: 740,
    height: 970,
    nodes: [
      {
        id: 'identity',
        x: 24,
        y: 24,
        width: 280,
        title: 'Identity + Origin',
        detail: 'Verified caller',
      },
      {
        id: 'input',
        x: 24,
        y: 220,
        width: 280,
        title: 'Bounded input',
        detail: 'Validate request shape',
      },
      {
        id: 'owner',
        x: 24,
        y: 416,
        width: 280,
        title: 'Thread ownership',
        detail: 'Owner-scoped read',
      },
      {
        id: 'admission',
        x: 24,
        y: 612,
        width: 280,
        title: 'Admission',
        detail: 'Reserve allowed work',
      },
      {
        id: 'provider',
        x: 24,
        y: 808,
        width: 280,
        title: 'Provider stream',
        detail: 'Server policy and key',
        accent: true,
      },
      {
        id: 'reject',
        x: 436,
        y: 416,
        width: 280,
        title: 'Any failed gate',
        detail: 'HTTP error before stream',
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
          x: 250,
          y: 771,
        },
      },
      {
        from: 'identity',
        to: 'reject',
        points: [
          [304, 71],
          [370, 71],
          [370, 463],
          [436, 463],
        ],
        dashed: true,
      },
      {
        from: 'input',
        to: 'reject',
        points: [
          [304, 267],
          [370, 267],
          [370, 463],
          [436, 463],
        ],
        dashed: true,
      },
      {
        from: 'owner',
        to: 'reject',
        dashed: true,
      },
      {
        from: 'admission',
        to: 'reject',
        points: [
          [304, 659],
          [370, 659],
          [370, 463],
          [436, 463],
        ],
        dashed: true,
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
    width: 740,
    height: 640,
    nodes: [
      {
        id: 'catalog',
        x: 24,
        y: 24,
        width: 280,
        title: 'Trusted catalog',
        detail: 'Components + prop schemas',
      },
      {
        id: 'model',
        x: 24,
        y: 260,
        width: 280,
        title: 'Model response',
        detail: 'Component name + props',
      },
      {
        id: 'render',
        x: 436,
        y: 260,
        width: 280,
        title: 'Your component',
        detail: 'Read-only presentation',
      },
      {
        id: 'action',
        x: 436,
        y: 500,
        width: 280,
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
        from: 'render',
        to: 'action',
        label: {
          text: 'Accept',
          x: 650,
          y: 449,
        },
        dashed: true,
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
    width: 740,
    height: 640,
    nodes: [
      {
        id: 'run',
        x: 230,
        y: 24,
        width: 280,
        title: 'Conversation runtime',
        detail: 'Original assistant text',
      },
      {
        id: 'render',
        x: 24,
        y: 260,
        width: 280,
        title: 'Markdown renderer',
        detail: 'Format the growing string',
      },
      {
        id: 'final',
        x: 24,
        y: 500,
        width: 280,
        title: 'Finalize parsing',
        detail: 'isComplete when text ends',
      },
      {
        id: 'outcome',
        x: 436,
        y: 260,
        width: 280,
        title: 'Request outcome',
        detail: 'Success, stopped, or failed',
        accent: true,
      },
    ],
    edges: [
      {
        from: 'run',
        to: 'render',
        points: [
          [370, 118],
          [370, 200],
          [164, 200],
          [164, 260],
        ],
      },
      {
        from: 'render',
        to: 'final',
      },
      {
        from: 'run',
        to: 'outcome',
        points: [
          [370, 118],
          [370, 200],
          [576, 200],
          [576, 260],
        ],
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
    width: 740,
    height: 740,
    nodes: [
      {
        id: 'check',
        x: 230,
        y: 24,
        width: 280,
        title: 'Check capability',
        detail: 'Explicit Prepare action',
      },
      {
        id: 'prepare',
        x: 24,
        y: 280,
        width: 280,
        title: 'Prepare model',
        detail: 'Download progress',
      },
      {
        id: 'ready',
        x: 436,
        y: 280,
        width: 280,
        title: 'Ready locally',
        detail: 'Generation may begin',
        accent: true,
      },
      {
        id: 'disabled',
        x: 230,
        y: 580,
        width: 280,
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
          x: 164,
          y: 183,
        },
        points: [
          [370, 118],
          [370, 200],
          [164, 200],
          [164, 280],
        ],
      },
      {
        from: 'prepare',
        to: 'ready',
        label: {
          text: 'prepared',
          x: 370,
          y: 315,
        },
      },
      {
        from: 'check',
        to: 'ready',
        label: {
          text: 'already available',
          x: 576,
          y: 183,
        },
        points: [
          [370, 118],
          [370, 200],
          [576, 200],
          [576, 280],
        ],
      },
      {
        from: 'prepare',
        to: 'disabled',
        label: {
          text: 'failure / Stop',
          x: 210,
          y: 549,
        },
        points: [
          [164, 374],
          [164, 510],
          [370, 510],
          [370, 580],
        ],
      },
      {
        from: 'check',
        to: 'disabled',
        label: {
          text: 'unavailable',
          x: 630,
          y: 549,
        },
        points: [
          [510, 71],
          [730, 71],
          [730, 638],
          [510, 638],
        ],
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
    width: 740,
    height: 650,
    nodes: [
      {
        id: 'presentation',
        x: 230,
        y: 24,
        width: 280,
        title: 'Threadplane UI',
        detail: 'ChatComponent',
      },
      {
        id: 'runtime',
        x: 230,
        y: 260,
        width: 280,
        title: 'Threadplane agent',
        detail: 'provideAgent / injectAgent',
        accent: true,
      },
      {
        id: 'server',
        x: 230,
        y: 500,
        width: 280,
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
          x: 200,
          y: 209,
        },
        points: [
          [330, 118],
          [330, 260],
        ],
      },
      {
        from: 'runtime',
        to: 'server',
        label: {
          text: 'AG-UI request',
          x: 190,
          y: 449,
        },
        points: [
          [330, 354],
          [330, 500],
        ],
      },
      {
        from: 'server',
        to: 'runtime',
        label: {
          text: 'events',
          x: 550,
          y: 449,
        },
        points: [
          [410, 500],
          [410, 354],
        ],
        dashed: true,
      },
      {
        from: 'runtime',
        to: 'presentation',
        label: {
          text: 'text + status',
          x: 550,
          y: 209,
        },
        points: [
          [410, 260],
          [410, 118],
        ],
        dashed: true,
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
    width: 740,
    height: 650,
    nodes: [
      {
        id: 'presentation',
        x: 230,
        y: 24,
        width: 280,
        title: 'Threadplane UI',
        detail: 'ChatInput + TextTranscript',
      },
      {
        id: 'runtime',
        x: 230,
        y: 260,
        width: 280,
        title: 'Hashbrown useChat',
        detail: 'Messages, Send, Stop',
        accent: true,
      },
      {
        id: 'server',
        x: 230,
        y: 500,
        width: 280,
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
          x: 200,
          y: 209,
        },
        points: [
          [330, 118],
          [330, 260],
        ],
      },
      {
        from: 'runtime',
        to: 'server',
        label: {
          text: 'AG-UI request',
          x: 190,
          y: 449,
        },
        points: [
          [330, 354],
          [330, 500],
        ],
      },
      {
        from: 'server',
        to: 'runtime',
        label: {
          text: 'events',
          x: 550,
          y: 449,
        },
        points: [
          [410, 500],
          [410, 354],
        ],
        dashed: true,
      },
      {
        from: 'runtime',
        to: 'presentation',
        label: {
          text: 'text + status',
          x: 550,
          y: 209,
        },
        points: [
          [410, 260],
          [410, 118],
        ],
        dashed: true,
      },
    ],
  },
};
