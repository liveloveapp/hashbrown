/** Recorded documentation demos, shared across React and Angular guides. */
export const DOCS_DEMOS = {
  'canonical-workbench-streaming-react': {
    title: 'React workbench: streaming.',
    caption:
      'Follow raw JSON into a streaming title and resolved plan steps, then accept and revise the plan.',
    recording:
      'Recorded in the real React workbench with OpenAI streaming requests and the actual Hashbrown SDK. Unchanged provider events paced at 20 ms for filming. Footage slowed to half speed for readability. Replay reads captured frames and does not make requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-schemas-react': {
    title: 'React workbench: schemas.',
    caption:
      'Inspect the shared plan contract, preview validation and explicit acceptance across two turns.',
    recording:
      'Recorded in the real React workbench with OpenAI streaming requests and the actual Hashbrown SDK. Unchanged provider events paced at 20 ms for filming. Footage slowed to half speed for readability. Replay reads captured frames and does not make requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-decisions-react': {
    title: 'React workbench: decisions.',
    caption:
      'Inspect a complete next-action choice and confidence, use the suggestion explicitly, then request the next choice.',
    recording:
      'Recorded in the real React workbench with TypeSafe decision requests and the actual Hashbrown SDK. Footage slowed to half speed for readability. Replay reads captured frames and does not make requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-streaming-angular': {
    title: 'Angular workbench: streaming.',
    caption:
      'Follow raw JSON into a streaming title and resolved plan steps, then accept and revise the plan.',
    recording:
      'Recorded in the real Angular workbench with OpenAI streaming requests and the actual Hashbrown SDK. Unchanged provider events paced at 20 ms for filming. Footage slowed to half speed for readability. Replay reads captured frames and does not make requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-schemas-angular': {
    title: 'Angular workbench: schemas.',
    caption:
      'Inspect the shared plan contract, preview validation and explicit acceptance across two turns.',
    recording:
      'Recorded in the real Angular workbench with OpenAI streaming requests and the actual Hashbrown SDK. Unchanged provider events paced at 20 ms for filming. Footage slowed to half speed for readability. Replay reads captured frames and does not make requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-decisions-angular': {
    title: 'Angular workbench: decisions.',
    caption:
      'Inspect a complete next-action choice and confidence, use the suggestion explicitly, then request the next choice.',
    recording:
      'Recorded in the real Angular workbench with TypeSafe decision requests and the actual Hashbrown SDK. Footage slowed to half speed for readability. Replay reads captured frames and does not make requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-ui-react': {
    title: 'React workbench: generative UI.',
    caption:
      'Watch streamed JSON resolve into a trusted SummaryCard, then accept and revise the plan.',
    recording:
      'Recorded in the real React workbench with OpenAI requests, browser tools, Hashbrown streaming, and application state. Footage slowed to half speed for readability. Replay reads captured frames. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-tools-react': {
    title: 'React workbench: tools.',
    caption:
      'Follow readContext from browser tool to continuation, then read the accepted plan in the second turn.',
    recording:
      'Recorded in the real React workbench with OpenAI requests, browser tools, Hashbrown streaming, and application state. Footage slowed to half speed for readability. Replay reads captured frames. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-structured-react': {
    title: 'React workbench: structured.',
    caption:
      'Watch a plain typed plan stream into an application-rendered card, then accept and revise it.',
    recording:
      'Recorded in the real React workbench with OpenAI requests, browser tools, Hashbrown streaming, and application state. Footage slowed to half speed for readability. Replay reads captured frames. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-ui-angular': {
    title: 'Angular workbench: generative UI.',
    caption:
      'Watch streamed JSON resolve into a trusted SummaryCard, then accept and revise the plan.',
    recording:
      'Recorded in the real Angular workbench with OpenAI requests, browser tools, Hashbrown streaming, and application state. Footage slowed to half speed for readability. Replay reads captured frames. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-tools-angular': {
    title: 'Angular workbench: tools.',
    caption:
      'Follow readContext from browser tool to continuation, then read the accepted plan in the second turn.',
    recording:
      'Recorded in the real Angular workbench with OpenAI requests, browser tools, Hashbrown streaming, and application state. Footage slowed to half speed for readability. Replay reads captured frames. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-structured-angular': {
    title: 'Angular workbench: structured.',
    caption:
      'Watch a plain typed plan stream into an application-rendered card, then accept and revise it.',
    recording:
      'Recorded in the real Angular workbench with OpenAI requests, browser tools, Hashbrown streaming, and application state. Footage slowed to half speed for readability. Replay reads captured frames. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-react': {
    title: 'Follow one React conversation from request to replay.',
    caption:
      'Watch JSON resolve into a trusted SummaryCard, accept a plan, and inspect a follow-up in the same conversation.',
    recording:
      'Recorded in the checked React workbench with real OpenAI requests, the browser readContext tool, Hashbrown streaming and component rendering. Footage slowed to half speed for readability. Playback reads captured data. No scripted provider output or narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-angular': {
    title: 'Follow one Angular conversation from request to replay.',
    caption:
      'Watch JSON resolve into a trusted SummaryCard, accept a plan, and inspect a follow-up in the same conversation.',
    recording:
      'Recorded in the checked Angular workbench with real OpenAI requests, the browser readContext tool, Hashbrown streaming and component rendering. Footage slowed to half speed for readability. Playback reads captured data. No scripted provider output or narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'ui-chatbot-react': {
    title: 'Read, propose, then apply.',
    caption:
      'Read a simulated light through a browser tool, review a trusted component, and apply the change before asking a follow-up.',
    recording:
      'Recorded through the checked React client with scripted HTTP AG-UI events. The browser tool, continuation, component renderer and local state are real. No live model or real device. Presentation styles added. No narration.',
    dimensions: { width: 1440, height: 900 },
  },
  'ui-chatbot-angular': {
    title: 'Read, propose, then apply.',
    caption:
      'Read a simulated light through a browser tool, review a trusted component, and apply the change before asking a follow-up.',
    recording:
      'Recorded through the checked Angular client with scripted HTTP AG-UI events. The browser tool, continuation, component renderer and local state are real. No live model or real device. Presentation styles added. No narration.',
    dimensions: { width: 1440, height: 900 },
  },
  'json-parser-react': {
    title: 'Read useful JSON before the stream ends.',
    caption:
      'Watch a forecast grow and alerts appear as their required fields resolve. Validate the finished document before treating it as complete.',
    recording:
      'Recorded through the checked React parser component with a finite local JSON stream. No model, weather service or API key is used. Presentation styles added. No narration.',
    dimensions: { width: 1440, height: 900 },
  },
  'json-parser-angular': {
    title: 'Read useful JSON before the stream ends.',
    caption:
      'Watch a forecast grow and alerts appear as their required fields resolve. Validate the finished document before treating it as complete.',
    recording:
      'Recorded through the checked Angular parser component with a finite local JSON stream. No model, weather service or API key is used. Presentation styles added. No narration.',
    dimensions: { width: 1440, height: 900 },
  },
  'threadplane-react': {
    title: 'Compose a React chat with Threadplane.',
    caption:
      'Send a product question and follow up through the installed Threadplane controls and Hashbrown runtime.',
    recording:
      'Recorded in the installed React consumer using the pinned Threadplane source packages and actual Hashbrown adapter. Provider-native responses are scripted locally. Presentation styles added. No live model call or narration.',
    dimensions: { width: 1440, height: 900 },
  },
  'threadplane-angular': {
    title: 'Connect Angular chat to your endpoint.',
    caption:
      'Send a product question and follow up through Threadplane’s installed Angular chat and AG-UI adapter.',
    recording:
      'Recorded in the installed Angular consumer using published Threadplane packages and the actual Hashbrown adapter. Provider-native responses are scripted locally. Presentation styles added. No live model call or narration.',
    dimensions: { width: 1440, height: 900 },
  },
  'request-transformation': {
    title: 'Add the context your server owns.',
    caption:
      'Ask about support. The server adds the workspace plan before the provider request.',
    recording:
      'Recorded with the checked React and Angular clients, Express server and OpenAI adapter. Provider responses are scripted locally. Presentation styles added. No live model call or narration.',
    dimensions: { width: 1440, height: 900 },
  },
  'local-models': {
    dimensions: { width: 1440, height: 900 },
    title: 'Prepare a model. Extract a trip brief.',
    caption:
      'Prepare Chrome’s browser-managed model and generate a typed destination and trip length on-device.',
    recording:
      'Recorded with real Chrome inference through the checked clients and local transport. React recorded; Angular verified. Presentation styles added. No scripted answer, hosted model call, API key or narration.',
  },
  'agent-routing': {
    dimensions: { width: 1440, height: 900 },
    title: 'Choose a route. Run your handler.',
    caption:
      'Route an order question and a returns question through server-owned handlers.',
    recording:
      'Recorded in the checked support clients and Express server with scripted decision responses. React recorded; Angular verified. Fixed public example data, presentation styles added. No live model call or narration.',
  },
  'agent-fallback': {
    dimensions: { width: 1440, height: 900 },
    title: 'Ask for clarity. Recover explicitly.',
    caption:
      'Handle an uncertain decision and provider failure, then retry after an unexpected run failure.',
    recording:
      'Recorded in the checked support clients and Express server with scripted decision responses and failures. React recorded; Angular verified. Fixed public example data, presentation styles added. No live model call or narration.',
  },
  'magic-text': {
    dimensions: { width: 1440, height: 900 },
    title: 'Stream a reply. Inspect its source.',
    caption:
      'Render growing Markdown and open a citation in application-owned source details.',
    recording:
      'Recorded in the checked Magic Text clients with scripted AG-UI output. React recorded; Angular verified. Presentation styles added. No narration or live model call.',
  },
  'predictive-suggestions': {
    dimensions: { width: 1440, height: 900 },
    title: 'Suggest an item. Let the user choose.',
    caption:
      'Generate packing suggestions, accept one item and dismiss another without another model request.',
    recording:
      'Recorded in the checked packing-list clients with scripted AG-UI output. React recorded; Angular verified. Presentation styles added. Local state only; no narration, live model call or server write.',
  },
  'ui-selection': {
    dimensions: { width: 1440, height: 900 },
    title: 'Choose a view. Keep your own props.',
    caption:
      'Select a shopping summary or item list from a request, using application-owned components and data.',
    recording:
      'Recorded in the checked UI selection clients with scripted decision responses. React recorded; Angular verified. Presentation styles added. No narration or live model call.',
  },
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
  {
    title: string;
    caption: string;
    recording?: string;
    dimensions?: { width: number; height: number };
  }
>;

/** The stable identifier of a recorded documentation demo. */
export type DocsDemoId = keyof typeof DOCS_DEMOS;
