import type { DiagramDefinition } from '../diagram-types';

/** Source-backed boundaries for provider, agent and migration documentation. */
export const INTEGRATION_DIAGRAM_DEFINITIONS: Record<
  string,
  DiagramDefinition
> = {
  // packages/{openai,anthropic,azure,bedrock,google,ollama}/src/stream/text.fn.ts;
  // each platform guide's /run route encodes returned AG-UI events with EventEncoder.
  'direct-provider-request-boundary': {
    kind: 'sequence',
    title: 'One browser contract, a provider-specific server',
    caption:
      'The route owns access policy, credentials and model selection. The adapter translates the selected provider’s native stream.',
    description:
      'The browser posts AG-UI run input to an application route. The route passes input and server configuration to a provider adapter. The adapter calls the native model API, maps its stream to AG-UI events, and the route encodes those events as SSE for the browser.',
    participants: [
      { id: 'browser', title: 'Hashbrown browser' },
      { id: 'route', title: 'Application route' },
      { id: 'adapter', title: 'Provider adapter' },
      { id: 'model', title: 'Native model API' },
    ],
    messages: [
      { from: 'browser', to: 'route', label: 'POST AG-UI RunAgentInput' },
      {
        from: 'route',
        to: 'adapter',
        label: 'Input + server model, credentials, signal',
      },
      { from: 'adapter', to: 'model', label: 'Native SDK request' },
      { from: 'model', to: 'adapter', label: 'Provider stream', dashed: true },
      {
        from: 'adapter',
        to: 'route',
        label: 'Canonical AG-UI events',
        dashed: true,
      },
      { from: 'route', to: 'browser', label: 'AG-UI SSE', dashed: true },
    ],
  },
  // www/content/docs/{angular,react}/platform/custom.md, Map the Provider Stream.
  'custom-provider-event-lifecycle': {
    kind: 'flow',
    width: 740,
    height: 670,
    title: 'Close the message before closing the run',
    caption:
      'This is the successful text-only path. Errors end with RUN_ERROR; cancellation stops provider work.',
    description:
      'A successful custom text provider emits RUN_STARTED, TEXT_MESSAGE_START, zero or more TEXT_MESSAGE_CONTENT events, TEXT_MESSAGE_END, then RUN_FINISHED. The HTTP route encodes these values rather than changing their lifecycle.',
    nodes: [
      { id: 'run', x: 220, y: 20, width: 300, title: 'Start run' },
      { id: 'start', x: 220, y: 150, width: 300, title: 'Open message' },
      {
        id: 'content',
        x: 220,
        y: 280,
        width: 300,
        title: 'Stream text',
        detail: 'Zero or more deltas',
      },
      { id: 'end', x: 220, y: 430, width: 300, title: 'Close message' },
      { id: 'done', x: 220, y: 560, width: 300, title: 'Finish run' },
    ],
    edges: [
      { from: 'run', to: 'start' },
      { from: 'start', to: 'content' },
      { from: 'content', to: 'end' },
      { from: 'end', to: 'done' },
    ],
  },
  // platform/langgraph.md: optional helper emits CUSTOM progress; the bridge owns standard tool frames.
  'langgraph-agent-boundary': {
    kind: 'architecture',
    width: 740,
    height: 640,
    title: 'The graph owns execution; the bridge owns AG-UI',
    caption:
      'Conceptual integration boundary. The optional tool-step helper adds display information; it does not replace the AG-UI bridge.',
    description:
      'A browser connects to the application’s AG-UI bridge, which hosts a plain LangGraph agent. Approved server tools execute inside the graph. The optional helper emits tool-step display updates, and persisted ToolMessages retain settled step metadata in graph state.',
    nodes: [
      {
        id: 'browser',
        x: 170,
        y: 20,
        width: 400,
        title: 'Hashbrown browser',
        detail: 'Conversation and tool-step views',
      },
      {
        id: 'bridge',
        x: 170,
        y: 180,
        width: 400,
        title: 'AG-UI bridge',
        detail: 'Run and tool lifecycle events',
      },
      {
        id: 'graph',
        x: 170,
        y: 340,
        width: 400,
        title: 'Plain LangGraph agent',
        detail: 'Approval gates and server tools',
      },
      {
        id: 'state',
        x: 170,
        y: 500,
        width: 400,
        title: 'Graph state',
        detail: 'ToolMessage + settled b4_step metadata',
      },
    ],
    edges: [
      { from: 'browser', to: 'bridge' },
      { from: 'bridge', to: 'graph' },
      { from: 'graph', to: 'state' },
    ],
  },
  // packages/dotnet/src/{HashbrownEndpointConfiguration,ProviderFactory,HashbrownRequestClient}.cs.
  'dotnet-agent-boundary': {
    kind: 'sequence',
    title: 'Host an agent behind ASP.NET Core',
    caption:
      'The .NET endpoint composes Microsoft Agent Framework and a server-selected model provider. The browser contract remains AG-UI.',
    description:
      'Hashbrown sends AG-UI input to ASP.NET Core. The endpoint configures the Microsoft Agent Framework agent using server policy. The agent calls OpenAI or Azure OpenAI, and its AG-UI stream returns through the endpoint to the browser.',
    participants: [
      { id: 'browser', title: 'Hashbrown browser' },
      { id: 'endpoint', title: 'ASP.NET Core' },
      { id: 'agent', title: 'MAF agent' },
      { id: 'provider', title: 'OpenAI or Azure' },
    ],
    messages: [
      { from: 'browser', to: 'endpoint', label: 'AG-UI run input' },
      {
        from: 'endpoint',
        to: 'agent',
        label: 'Request configuration + server policy',
      },
      { from: 'agent', to: 'provider', label: 'Server-selected model request' },
      {
        from: 'provider',
        to: 'agent',
        label: 'Native response stream',
        dashed: true,
      },
      { from: 'agent', to: 'endpoint', label: 'AG-UI events', dashed: true },
      { from: 'endpoint', to: 'browser', label: 'AG-UI SSE', dashed: true },
    ],
  },
  // packages/dotnet/src/{NativeSessionAgentFactory,NativeSessionContext,PostgresNativeSessionJournal}.cs;
  // platform/dotnet-native-tools.md, What happens during a mixed turn (no protected approval path).
  'dotnet-native-mixed-turn': {
    kind: 'sequence',
    title: 'Browser results release deferred server work',
    caption:
      'A mixed turn without protected approval. Native approval has a separate decision flow; unresolved browser work cannot be cold-restored.',
    description:
      'The native endpoint exposes browser tool calls while retaining server descriptors privately. The browser executes its own handler and returns the exact pending result. The endpoint commits a Started marker before dispatching a registered server function, then durably saves native and public state before authorizing terminal publication. This does not guarantee exactly-once external effects.',
    participants: [
      { id: 'browser', title: 'Browser runtime' },
      { id: 'endpoint', title: 'Native endpoint' },
      { id: 'journal', title: 'Postgres journal' },
      { id: 'function', title: 'Registered function' },
    ],
    messages: [
      {
        from: 'endpoint',
        to: 'browser',
        label: 'Expose browser calls; retain server descriptors',
      },
      {
        from: 'browser',
        to: 'endpoint',
        label: 'Exact pending browser results',
      },
      {
        from: 'endpoint',
        to: 'journal',
        label: 'Commit Started dispatch marker',
      },
      {
        from: 'endpoint',
        to: 'function',
        label: 'Invoke registered server function',
      },
      {
        from: 'function',
        to: 'endpoint',
        label: 'Genuine result',
        dashed: true,
      },
      {
        from: 'endpoint',
        to: 'journal',
        label: 'Save native state + canonical transcript',
      },
      {
        from: 'endpoint',
        to: 'browser',
        label: 'Publish authorized terminal event',
        dashed: true,
      },
    ],
  },
  // packages/typesafe/src/decide.fn.ts validates unknown input and compiles optional server schema.
  'typesafe-json-decision-boundary': {
    kind: 'sequence',
    title: 'A decision completes as JSON',
    caption:
      'Pin the model and, when required, the questions on the server. The application chooses what action follows the answer.',
    description:
      'A browser posts a decision request to the application route. The TypeSafe adapter validates it and optionally replaces client questions with a server schema, calls the pinned Jev model, and returns a complete decision as JSON. There is no AG-UI text stream in this path.',
    participants: [
      { id: 'browser', title: 'Decision client' },
      { id: 'server', title: 'Application route' },
      { id: 'adapter', title: 'TypeSafe adapter' },
      { id: 'jev', title: 'Pinned Jev model' },
    ],
    messages: [
      { from: 'browser', to: 'server', label: 'POST decision request' },
      {
        from: 'server',
        to: 'adapter',
        label: 'Unknown input + optional pinned schema',
      },
      { from: 'adapter', to: 'jev', label: 'Validated native request' },
      { from: 'jev', to: 'adapter', label: 'Complete answer', dashed: true },
      { from: 'adapter', to: 'server', label: 'Typed decision', dashed: true },
      { from: 'server', to: 'browser', label: 'JSON response', dashed: true },
    ],
  },
  // production/app.ts configures fenced pools, required grants and separate createApplicationStore.
  // Installed @b4run/postgres-storage/dist/schema.js has independent runtime tables: no inferred FK to app rows.
  'b4-durable-ownership': {
    kind: 'architecture',
    width: 740,
    height: 640,
    title: 'Durability has two owners',
    caption:
      'Conceptual ownership map. Runtime checkpoints retain conversation progress; application transactions retain the business result.',
    description:
      'The application verifies identity and thread ownership before admitting runtime work. Request admission supplies a fenced pool to runtime stores and application writes. Runtime stores retain checkpoints, threads, permissions, client calls and approval grants. The application separately writes its accepted result and operation receipt. These boxes are responsibilities, not database tables.',
    nodes: [
      {
        id: 'edge',
        x: 220,
        y: 20,
        width: 300,
        title: 'Application boundary',
        detail: 'Identity, owner checks and same-origin mutations',
      },
      {
        id: 'admission',
        x: 220,
        y: 230,
        width: 300,
        title: 'Run admission',
        detail: 'Request-scoped fenced pool',
      },
      {
        id: 'runtime',
        x: 20,
        y: 450,
        width: 320,
        title: 'b4.run runtime stores',
        detail: 'Checkpoints, threads, permissions, client calls and grants',
      },
      {
        id: 'app',
        x: 400,
        y: 450,
        width: 320,
        title: 'Application transaction',
        detail: 'Accepted result and unique operation receipt',
      },
    ],
    edges: [
      { from: 'edge', to: 'admission' },
      {
        from: 'admission',
        to: 'runtime',
        points: [
          [370, 324],
          [370, 400],
          [180, 400],
          [180, 450],
        ],
      },
      {
        from: 'admission',
        to: 'app',
        points: [
          [370, 324],
          [370, 400],
          [560, 400],
          [560, 450],
        ],
      },
    ],
  },
  // Actual DDL: www/examples/quickstart/server/production/storage.ts, ready().
  // Only the app-owned tables are shown; no invented relationship to b4.run runtime tables.
  'b4-recording-plan-erd': {
    kind: 'erd',
    width: 740,
    height: 600,
    title: 'The recording plan and its acceptance receipt',
    caption:
      'Actual application tables in hashbrown_production. The receipt’s composite primary key prevents duplicate records for one operation revision.',
    description:
      'application_plans has primary key thread_id and stores owner_id, configuration, revision and plan. application_receipts has composite primary key thread_id plus operation_revision; thread_id is a foreign key to application_plans. Each receipt belongs to one plan, and a plan can have zero or many receipts by schema. The current acceptance implementation records only operation revision zero.',
    nodes: [
      {
        id: 'plans',
        x: 120,
        y: 20,
        width: 500,
        title: 'application_plans',
        fields: [
          { name: 'thread_id', type: 'text', key: 'PK' },
          { name: 'owner_id', type: 'text' },
          { name: 'configuration', type: 'text' },
          { name: 'revision', type: 'integer' },
          { name: 'plan', type: 'jsonb' },
        ],
      },
      {
        id: 'receipts',
        x: 120,
        y: 380,
        width: 500,
        title: 'application_receipts',
        fields: [
          { name: 'thread_id', type: 'text', key: 'PK/FK' },
          { name: 'operation_revision', type: 'integer', key: 'PK' },
          { name: 'owner_id', type: 'text' },
        ],
      },
    ],
    edges: [
      {
        from: 'plans',
        to: 'receipts',
        arrow: false,
        label: { text: '1 plan · 0..* receipts', x: 530, y: 328 },
      },
    ],
  },
  // production/app.ts recovery route; platform/b4run.md Restore without running / Make resume a new decision.
  'b4-read-then-resume': {
    kind: 'sequence',
    title: 'Restoring a proposal does not accept it',
    caption:
      'Recovery reads durable state. A fresh, explicit approval begins the protected execution path.',
    description:
      'The browser reads authorized recovery. The server returns a snapshot and application result. The browser restores local history without executing work. After a user explicitly approves, the browser submits the current decision and grant. The server consumes the grant and admits the run, then applies the protected application transaction.',
    participants: [
      { id: 'browser', title: 'Browser' },
      { id: 'server', title: 'Authorized routes' },
      { id: 'database', title: 'Postgres' },
    ],
    messages: [
      { from: 'browser', to: 'server', label: 'GET owned thread recovery' },
      {
        from: 'server',
        to: 'database',
        label: 'Read checkpoint + application state',
      },
      {
        from: 'server',
        to: 'browser',
        label: 'Snapshot + result; restore locally',
        dashed: true,
      },
      {
        from: 'browser',
        to: 'server',
        label: 'Explicit current approval + opaque grant',
      },
      {
        from: 'server',
        to: 'database',
        label: 'Consume grant and admit protected run',
      },
      {
        from: 'server',
        to: 'database',
        label: 'Transaction: check owner, write plan + receipt',
      },
    ],
  },
  // Historical contract documented in migrations/v0-6.md, Rewrite the Server Endpoint.
  'migration-v06-transport': {
    kind: 'architecture',
    width: 740,
    height: 450,
    title: 'Upgrade both sides of the transport',
    caption:
      'Historical v0.5 to v0.6 boundary. The endpoint changes its input contract and its response encoding together.',
    description:
      'In v0.5, the client sends a Hashbrown completion request and receives encoded binary frames. In v0.6, the client sends AG-UI RunAgentInput and receives AG-UI events encoded as SSE. In the v0.6 path the server selects the provider model.',
    nodes: [
      {
        id: 'old-client',
        x: 20,
        y: 20,
        width: 280,
        title: 'v0.5 client',
        detail: 'Completion request',
      },
      {
        id: 'old-server',
        x: 440,
        y: 20,
        width: 280,
        title: 'v0.5 endpoint',
        detail: 'Binary frame response',
      },
      {
        id: 'client',
        x: 20,
        y: 260,
        width: 280,
        title: 'v0.6 client',
        detail: 'AG-UI RunAgentInput',
      },
      {
        id: 'server',
        x: 440,
        y: 260,
        width: 280,
        title: 'v0.6 endpoint',
        detail: 'AG-UI SSE; server model',
      },
    ],
    edges: [
      {
        from: 'old-client',
        to: 'old-server',
        arrow: false,
        points: [
          [160, 114],
          [160, 180],
          [580, 180],
          [580, 114],
        ],
        label: { text: 'Completion input + binary output', x: 370, y: 164 },
      },
      {
        from: 'client',
        to: 'server',
        arrow: false,
        points: [
          [160, 354],
          [160, 420],
          [580, 420],
          [580, 354],
        ],
        label: { text: 'AG-UI input + SSE events', x: 370, y: 404 },
      },
    ],
  },
  // packages/core/src/transport/hashbrown-run-agent-input.ts strips role: activity from outbound messages.
  // migrations/v0-8.md documents introduction of the client-visible activity variant.
  'migration-v08-activity-boundary': {
    kind: 'architecture',
    width: 740,
    height: 610,
    title: 'Keep activities in the transcript, out of the next run',
    caption:
      'The v0.8 change affects display and request history differently. Saving canonical messages can retain activities.',
    description:
      'Server activity events reach the client’s message list alongside conversation messages. On the next run, Hashbrown removes role activity records from outbound messages. A saved client transcript can retain them; they are not instructions for the agent.',
    nodes: [
      {
        id: 'events',
        x: 220,
        y: 20,
        width: 300,
        title: 'AG-UI activity events',
        detail: 'Snapshot and delta',
      },
      {
        id: 'messages',
        x: 220,
        y: 200,
        width: 300,
        title: 'Client messages',
        detail: 'Conversation + activities',
      },
      {
        id: 'next',
        x: 20,
        y: 420,
        width: 320,
        title: 'Next run input',
        detail: 'Conversation; activities removed',
      },
      {
        id: 'saved',
        x: 400,
        y: 420,
        width: 320,
        title: 'Saved transcript',
        detail: 'Can retain activity records',
      },
    ],
    edges: [
      { from: 'events', to: 'messages' },
      {
        from: 'messages',
        to: 'next',
        points: [
          [370, 294],
          [370, 370],
          [180, 370],
          [180, 420],
        ],
      },
      {
        from: 'messages',
        to: 'saved',
        points: [
          [370, 294],
          [370, 370],
          [560, 370],
          [560, 420],
        ],
      },
    ],
  },
  // React migrations/threadplane.md and recipes/threadplane.md retain useChat, project text rows.
  'threadplane-react-ownership': {
    kind: 'architecture',
    width: 740,
    height: 620,
    title: 'Replace the view around the same useChat owner',
    caption:
      'React text composition keeps the mounted Hashbrown runtime and existing endpoint. Transcript rows are a display projection.',
    description:
      'Threadplane ChatInput delegates send and stop to the existing useChat instance. That runtime retains canonical history and the existing AG-UI endpoint. TextTranscript renders selected string messages; it does not replace canonical history or become another runtime.',
    nodes: [
      {
        id: 'input',
        x: 220,
        y: 20,
        width: 300,
        title: 'Threadplane ChatInput',
        detail: 'sendMessage and stop callbacks',
      },
      {
        id: 'runtime',
        x: 220,
        y: 210,
        width: 300,
        title: 'Existing useChat',
        detail: 'Canonical messages and transport',
      },
      {
        id: 'view',
        x: 20,
        y: 440,
        width: 320,
        title: 'TextTranscript',
        detail: 'Selected text rows',
      },
      {
        id: 'endpoint',
        x: 400,
        y: 440,
        width: 320,
        title: 'Existing endpoint',
        detail: 'Server policy and provider',
      },
    ],
    edges: [
      { from: 'input', to: 'runtime' },
      {
        from: 'runtime',
        to: 'view',
        points: [
          [370, 326],
          [370, 390],
          [180, 390],
          [180, 440],
        ],
      },
      {
        from: 'runtime',
        to: 'endpoint',
        points: [
          [370, 326],
          [370, 390],
          [560, 390],
          [560, 440],
        ],
      },
    ],
  },
  // Angular migrations/threadplane.md: provideAgent/injectAgent replace this screen’s chatResource.
  'threadplane-angular-ownership': {
    kind: 'flow',
    width: 740,
    height: 620,
    title: 'Replace the browser owner, preserve the server',
    caption:
      'Angular uses a new Threadplane AG-UI agent for this screen. Move required instructions to the server and plan history migration explicitly.',
    description:
      'The existing screen owns a Hashbrown chatResource. The replacement screen owns a component-scoped Threadplane agent through provideAgent and injectAgent, with ChatComponent as its view. The existing AG-UI server retains identity, policy and model selection. The arrow represents a deliberate migration, not automatic state transfer.',
    nodes: [
      {
        id: 'old',
        x: 170,
        y: 20,
        width: 400,
        title: 'Existing screen',
        detail: 'chatResource + custom view',
      },
      {
        id: 'new',
        x: 170,
        y: 230,
        width: 400,
        title: 'Replacement screen',
        detail: 'Threadplane agent + ChatComponent',
      },
      {
        id: 'server',
        x: 170,
        y: 440,
        width: 400,
        title: 'Existing AG-UI server',
        detail: 'Trusted instructions, identity and model',
      },
    ],
    edges: [
      {
        from: 'old',
        to: 'new',
        label: { text: 'Migrate', x: 440, y: 184 },
      },
      { from: 'new', to: 'server' },
    ],
  },
};
