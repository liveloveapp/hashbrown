/**
 * Player metadata for one recorded documentation demo. Every field is
 * required, so an entry without a disclosure or captured size fails typecheck.
 */
export interface DocsDemoMedia {
  /** Accessible name of the video. */
  readonly title: string;
  /** Visible caption describing what the recording shows. */
  readonly caption: string;
  /** How the footage was recorded, shown beneath the player. */
  readonly recording: string;
  /** Captured pixel size, which sets the player's aspect ratio. */
  readonly dimensions: { readonly width: number; readonly height: number };
}

/** Recorded documentation demos, shared across React and Angular guides. */
export const DOCS_DEMOS = {
  'canonical-workbench-production-recovery-react': {
    title: 'React workbench: durable recovery with b4.run.',
    caption:
      'Restore a paused turn after a server restart, then explicitly approve the application-owned plan.',
    recording:
      'Real OpenAI output through Hashbrown React and b4.run 0.15.5 with isolated Postgres storage. Actual-speed footage with reading pauses and no narration. A genuine server process replacement preserves the checkpoint and pending approval. Explicit restoration generates no model request. Explicit approval commits one plan revision and database receipt; this does not guarantee exactly-once external effects. The local identity adapter uses a signed anonymous cookie, not account login. The post-refresh capture records newly observed recovery and resume facts, not the original stream timing. Playback sends no requests and writes no application state.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-production-recovery-angular': {
    title: 'Angular workbench: durable recovery with b4.run.',
    caption:
      'Restore a paused turn after a server restart, then explicitly approve the application-owned plan.',
    recording:
      'Real OpenAI output through Hashbrown Angular and b4.run 0.15.5 with isolated Postgres storage. Actual-speed footage with reading pauses and no narration. A genuine server process replacement preserves the checkpoint and pending approval. Explicit restoration generates no model request. Explicit approval commits one plan revision and database receipt; this does not guarantee exactly-once external effects. The local identity adapter uses a signed anonymous cookie, not account login. The post-refresh capture records newly observed recovery and resume facts, not the original stream timing. Playback sends no requests and writes no application state.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-local-models-react': {
    title: 'React workbench: local models.',
    caption:
      'Prepare the native model, generate a typed plan locally, and explicitly accept each proposal.',
    recording:
      'Actual native Chrome inference through the Hashbrown React structured-chat API and experimental_chrome transport. The existing dedicated test profile had a model available under requested v4 browser configuration; that configuration does not identify the loaded model or establish availability elsewhere. No new download, scripted model answer or hosted model request. Actual-speed footage with reading pauses; no narration. Native EOF, JSON validation and application acceptance are distinct. Replay opens no sessions, sends no prompts, downloads no models and writes no application state. Test-only native API fixtures are excluded from published footage.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-local-models-angular': {
    title: 'Angular workbench: local models.',
    caption:
      'Prepare the native model, generate a typed plan locally, and explicitly accept each proposal.',
    recording:
      'Actual native Chrome inference through the Hashbrown Angular structured-chat API and experimental_chrome transport. The existing dedicated test profile had a model available under requested v4 browser configuration; that configuration does not identify the loaded model or establish availability elsewhere. No new download, scripted model answer or hosted model request. Actual-speed footage with reading pauses; no narration. Native EOF, JSON validation and application acceptance are distinct. Replay opens no sessions, sends no prompts, downloads no models and writes no application state. Test-only native API fixtures are excluded from published footage.',
    dimensions: { width: 1600, height: 1000 },
  },

  'canonical-workbench-javascript-runtime-react': {
    title: 'React workbench: JavaScript runtime.',
    caption:
      'Run visible JavaScript against the plan, inspect actual host calls and recover from errors.',
    recording:
      'Recorded with actual Hashbrown React runtime APIs and genuine QuickJS execution. The scripts are application-owned; there is no model or provider request and no simulated JSON streaming. Each run uses a fresh context. The host validates arguments explicitly. Estimates leave the plan unchanged. Footage is slowed to half speed for readability. Replay executes no scripts, host functions, requests or application writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-javascript-runtime-angular': {
    title: 'Angular workbench: JavaScript runtime.',
    caption:
      'Run visible JavaScript against the plan, inspect actual host calls and recover from errors.',
    recording:
      'Recorded with actual Hashbrown Angular runtime APIs and genuine QuickJS execution. The scripts are application-owned; there is no model or provider request and no simulated JSON streaming. Each run uses a fresh context. The host validates arguments explicitly. Estimates leave the plan unchanged. Footage is slowed to half speed for readability. Replay executes no scripts, host functions, requests or application writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },

  'canonical-workbench-ui-kits-react': {
    title: 'React workbench: UI Kits.',
    caption:
      'Reuse SummaryCard and StepsCard from one trusted kit, then explicitly accept each proposal.',
    recording:
      'Recorded with real OpenAI requests, actual Hashbrown React kit and UI chat APIs, trusted framework components and the real readContext browser tool. Kit metadata and schema come from the actual framework kit. The server requires fresh context before UI generation, then disables further tool calls for that response. SummaryCard and StepsCard are the only trusted components in this kit. Each proposal requires explicit validated acceptance. Unchanged protocol events are paced at 20 ms for filming; the normal host adds no delay. Footage is slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-ui-chatbot-react': {
    title: 'React workbench: UI chatbot.',
    caption:
      'Propose a plan, explicitly accept it, and read accepted state in a read-only follow-up.',
    recording:
      'Recorded with real OpenAI requests, actual Hashbrown React kit and UI chat APIs, trusted framework components and the real readContext browser tool. Kit metadata and schema come from the actual framework kit. The server requires fresh context before UI generation, then disables further tool calls for that response. SummaryCard proposes a plan; PlanReading is a read-only model report. Only explicit validated acceptance changes application state. Unchanged protocol events are paced at 20 ms for filming; the normal host adds no delay. Footage is slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-ui-kits-angular': {
    title: 'Angular workbench: UI Kits.',
    caption:
      'Reuse SummaryCard and StepsCard from one trusted kit, then explicitly accept each proposal.',
    recording:
      'Recorded with real OpenAI requests, actual Hashbrown Angular kit and UI chat APIs, trusted framework components and the real readContext browser tool. Kit metadata and schema come from the actual framework kit. The server requires fresh context before UI generation, then disables further tool calls for that response. SummaryCard and StepsCard are the only trusted components in this kit. Each proposal requires explicit validated acceptance. Unchanged protocol events are paced at 20 ms for filming; the normal host adds no delay. Footage is slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-ui-chatbot-angular': {
    title: 'Angular workbench: UI chatbot.',
    caption:
      'Propose a plan, explicitly accept it, and read accepted state in a read-only follow-up.',
    recording:
      'Recorded with real OpenAI requests, actual Hashbrown Angular kit and UI chat APIs, trusted framework components and the real readContext browser tool. Kit metadata and schema come from the actual framework kit. The server requires fresh context before UI generation, then disables further tool calls for that response. SummaryCard proposes a plan; PlanReading is a read-only model report. Only explicit validated acceptance changes application state. Unchanged protocol events are paced at 20 ms for filming; the normal host adds no delay. Footage is slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-agent-decisions-react': {
    title: 'React workbench: decisions in agents.',
    caption:
      'Inspect real TypeSafe route decisions and fixed application handler replies across two turns.',
    recording:
      'Recorded with real TypeSafe route decisions and whole application-owned handler text in the checked React workbench. Decision confidence gates only known read-only handlers; handler prose is not generated model text. Application state is unchanged. Unchanged protocol events are paced at 20 ms for filming; the normal host adds no delay. Footage is slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-json-parser-react': {
    title: 'React workbench: streaming JSON parser.',
    caption:
      'Follow actual OpenAI JSON into framework parser values and independent final validation.',
    recording:
      'Recorded with real OpenAI JSON and actual framework parser APIs in the checked React workbench. Source completion, parser completion, original JSON validation and application actions remain separate. Application state is unchanged. Unchanged protocol events are paced at 20 ms for filming; the normal host adds no delay. Footage is slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-natural-forms-react': {
    title: 'React workbench: natural language forms.',
    caption:
      'Generate, review, edit and explicitly apply a plan, then use the applied context in a follow-up.',
    recording:
      'Recorded with real OpenAI JSON and actual framework parser APIs in the checked React workbench. Source completion, parser completion, original JSON validation and application actions remain separate. Review and Apply are explicit; browser readContext returns the applied plan and revision. Unchanged protocol events are paced at 20 ms for filming; the normal host adds no delay. Footage is slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-agent-decisions-angular': {
    title: 'Angular workbench: decisions in agents.',
    caption:
      'Inspect real TypeSafe route decisions and fixed application handler replies across two turns.',
    recording:
      'Recorded with real TypeSafe route decisions and whole application-owned handler text in the checked Angular workbench. Decision confidence gates only known read-only handlers; handler prose is not generated model text. Application state is unchanged. Unchanged protocol events are paced at 20 ms for filming; the normal host adds no delay. Footage is slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-json-parser-angular': {
    title: 'Angular workbench: streaming JSON parser.',
    caption:
      'Follow actual OpenAI JSON into framework parser values and independent final validation.',
    recording:
      'Recorded with real OpenAI JSON and actual framework parser APIs in the checked Angular workbench. Source completion, parser completion, original JSON validation and application actions remain separate. Application state is unchanged. Unchanged protocol events are paced at 20 ms for filming; the normal host adds no delay. Footage is slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-natural-forms-angular': {
    title: 'Angular workbench: natural language forms.',
    caption:
      'Generate, review, edit and explicitly apply a plan, then use the applied context in a follow-up.',
    recording:
      'Recorded with real OpenAI JSON and actual framework parser APIs in the checked Angular workbench. Source completion, parser completion, original JSON validation and application actions remain separate. Review and Apply are explicit; browser readContext returns the applied plan and revision. Unchanged protocol events are paced at 20 ms for filming; the normal host adds no delay. Footage is slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },

  'canonical-workbench-server-threads-react': {
    title: 'React workbench: server-owned threads.',
    caption:
      'Load and save completed text, refresh, and recover from a genuine version conflict.',
    recording:
      'Recorded in the real React workbench with OpenAI and actual Hashbrown text chat. Local demo sessions and process-memory thread storage demonstrate application boundaries; they are not production authentication or durable agent checkpoints. Saves and reloads are explicit. HTTP denials and version conflicts come from the checked server. Unchanged provider events are paced at 20 ms for filming; footage slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-public-endpoint-react': {
    title: 'React workbench: public endpoints.',
    caption:
      'Compare anonymous and foreign-owner denials with an authorized streamed reply.',
    recording:
      'Recorded in the real React workbench with OpenAI and actual Hashbrown text chat. Local demo sessions and process-memory thread storage demonstrate application boundaries; they are not production authentication or durable agent checkpoints. Saves and reloads are explicit. HTTP denials and version conflicts come from the checked server. Unchanged provider events are paced at 20 ms for filming; footage slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-server-threads-angular': {
    title: 'Angular workbench: server-owned threads.',
    caption:
      'Load and save completed text, refresh, and recover from a genuine version conflict.',
    recording:
      'Recorded in the real Angular workbench with OpenAI and actual Hashbrown text chat. Local demo sessions and process-memory thread storage demonstrate application boundaries; they are not production authentication or durable agent checkpoints. Saves and reloads are explicit. HTTP denials and version conflicts come from the checked server. Unchanged provider events are paced at 20 ms for filming; footage slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-public-endpoint-angular': {
    title: 'Angular workbench: public endpoints.',
    caption:
      'Compare anonymous and foreign-owner denials with an authorized streamed reply.',
    recording:
      'Recorded in the real Angular workbench with OpenAI and actual Hashbrown text chat. Local demo sessions and process-memory thread storage demonstrate application boundaries; they are not production authentication or durable agent checkpoints. Saves and reloads are explicit. HTTP denials and version conflicts come from the checked server. Unchanged provider events are paced at 20 ms for filming; footage slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },

  'canonical-workbench-message-history-react': {
    title: 'React workbench: message history.',
    caption:
      'Keep completed text, clear and restore the SDK transcript, then inspect the next request.',
    recording:
      'Recorded in the real React workbench with OpenAI and actual Hashbrown text chat. Only validated completed text is retained; this is not a canonical agent checkpoint. Saving is explicit. No tools, generated UI, or executed plan steps. Unchanged provider events are paced at 20 ms for filming; the normal host adds no delay. Footage slowed to half speed for readability. Replay makes no requests or storage writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-save-text-conversations-react': {
    title: 'React workbench: save text conversations.',
    caption:
      'Save Lighthouse and Harbor, refresh, then load completed text into a fresh chat.',
    recording:
      'Recorded in the real React workbench with OpenAI and actual Hashbrown text chat. Only validated completed text is retained; this is not a canonical agent checkpoint. Saving is explicit. No tools, generated UI, or executed plan steps. Unchanged provider events are paced at 20 ms for filming; the normal host adds no delay. Footage slowed to half speed for readability. Replay makes no requests or storage writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-message-history-angular': {
    title: 'Angular workbench: message history.',
    caption:
      'Keep completed text, clear and restore the SDK transcript, then inspect the next request.',
    recording:
      'Recorded in the real Angular workbench with OpenAI and actual Hashbrown text chat. Only validated completed text is retained; this is not a canonical agent checkpoint. Saving is explicit. No tools, generated UI, or executed plan steps. Unchanged provider events are paced at 20 ms for filming; the normal host adds no delay. Footage slowed to half speed for readability. Replay makes no requests or storage writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-save-text-conversations-angular': {
    title: 'Angular workbench: save text conversations.',
    caption:
      'Save Lighthouse and Harbor, refresh, then load completed text into a fresh chat.',
    recording:
      'Recorded in the real Angular workbench with OpenAI and actual Hashbrown text chat. Only validated completed text is retained; this is not a canonical agent checkpoint. Saving is explicit. No tools, generated UI, or executed plan steps. Unchanged provider events are paced at 20 ms for filming; the normal host adds no delay. Footage slowed to half speed for readability. Replay makes no requests or storage writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-shared-state-react': {
    title: 'React workbench: shared agent state.',
    caption:
      'Set state without a request, then follow agent drafts, commit, and a second turn.',
    recording:
      'Recorded in the real React workbench with OpenAI and the actual Hashbrown SDK. The local AG-UI agent maps shared state into instructions and authors state, activity and approval events around unchanged provider text. No browser tools, generated UI schema or executed plan steps. Approval permits another explanation only. The approval store is bounded, expiring and process-local. Unchanged provider events are paced at 20 ms for filming; the normal host adds no delay. Footage slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-activities-react': {
    title: 'React workbench: activities.',
    caption:
      'Follow actual agent progress, stable activity links, and a new activity ID in the next turn.',
    recording:
      'Recorded in the real React workbench with OpenAI and the actual Hashbrown SDK. The local AG-UI agent maps shared state into instructions and authors state, activity and approval events around unchanged provider text. No browser tools, generated UI schema or executed plan steps. Approval permits another explanation only. The approval store is bounded, expiring and process-local. Unchanged provider events are paced at 20 ms for filming; the normal host adds no delay. Footage slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-interrupts-react': {
    title: 'React workbench: interrupt and resume.',
    caption:
      'Answer a complete approval batch, resume the same turn, and inspect a fresh batch on the next turn.',
    recording:
      'Recorded in the real React workbench with OpenAI and the actual Hashbrown SDK. The local AG-UI agent maps shared state into instructions and authors state, activity and approval events around unchanged provider text. No browser tools, generated UI schema or executed plan steps. Approval permits another explanation only. The approval store is bounded, expiring and process-local. Unchanged provider events are paced at 20 ms for filming; the normal host adds no delay. Footage slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-shared-state-angular': {
    title: 'Angular workbench: shared agent state.',
    caption:
      'Set state without a request, then follow agent drafts, commit, and a second turn.',
    recording:
      'Recorded in the real Angular workbench with OpenAI and the actual Hashbrown SDK. The local AG-UI agent maps shared state into instructions and authors state, activity and approval events around unchanged provider text. No browser tools, generated UI schema or executed plan steps. Approval permits another explanation only. The approval store is bounded, expiring and process-local. Unchanged provider events are paced at 20 ms for filming; the normal host adds no delay. Footage slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-activities-angular': {
    title: 'Angular workbench: activities.',
    caption:
      'Follow actual agent progress, stable activity links, and a new activity ID in the next turn.',
    recording:
      'Recorded in the real Angular workbench with OpenAI and the actual Hashbrown SDK. The local AG-UI agent maps shared state into instructions and authors state, activity and approval events around unchanged provider text. No browser tools, generated UI schema or executed plan steps. Approval permits another explanation only. The approval store is bounded, expiring and process-local. Unchanged provider events are paced at 20 ms for filming; the normal host adds no delay. Footage slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-interrupts-angular': {
    title: 'Angular workbench: interrupt and resume.',
    caption:
      'Answer a complete approval batch, resume the same turn, and inspect a fresh batch on the next turn.',
    recording:
      'Recorded in the real Angular workbench with OpenAI and the actual Hashbrown SDK. The local AG-UI agent maps shared state into instructions and authors state, activity and approval events around unchanged provider text. No browser tools, generated UI schema or executed plan steps. Approval permits another explanation only. The approval store is bounded, expiring and process-local. Unchanged provider events are paced at 20 ms for filming; the normal host adds no delay. Footage slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },

  'canonical-workbench-first-plan-react': {
    title: 'React workbench: your first plan.',
    caption:
      'Follow one tool-free request as streamed props become a trusted two-step plan preview.',
    recording:
      'Recorded in the real React workbench with OpenAI and the actual Hashbrown SDK. The standalone Quickstart and workbench share PlanCard and its registration. No browser tools, acceptance action or application writes. Unchanged provider events are paced at 20 ms for filming; the normal host adds no delay. Footage slowed to half speed for readability. Replay makes no requests. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-conversation-react': {
    title: 'React workbench: messages and turns.',
    caption:
      'Name the plan, follow up in the same conversation, and inspect retained messages and fresh run identities.',
    recording:
      'Recorded in the real React workbench with OpenAI and actual Hashbrown text chat. No browser tools or generated component props. Messages remain in the current local instance; no persistence across refresh is demonstrated. Unchanged provider events are paced at 20 ms for filming; the normal host adds no delay. Footage slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-system-instructions-react': {
    title: 'React workbench: system instructions.',
    caption:
      'Compare browser configuration with public server policy captured at the actual provider mapping boundary.',
    recording:
      'Recorded in the real React workbench with OpenAI and actual Hashbrown text chat. The endpoint replaces browser instructions; the inspector captures only the fixed public policy from the adapter mapping callback. Prompts do not grant authorization. No browser tools or application writes. Unchanged provider events are paced at 20 ms for filming; the normal host adds no delay. Footage slowed to half speed for readability. Replay makes no requests. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-first-plan-angular': {
    title: 'Angular workbench: your first plan.',
    caption:
      'Follow one tool-free request as streamed props become a trusted two-step plan preview.',
    recording:
      'Recorded in the real Angular workbench with OpenAI and the actual Hashbrown SDK. The standalone Quickstart and workbench share PlanCard and its registration. No browser tools, acceptance action or application writes. Unchanged provider events are paced at 20 ms for filming; the normal host adds no delay. Footage slowed to half speed for readability. Replay makes no requests. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-conversation-angular': {
    title: 'Angular workbench: messages and turns.',
    caption:
      'Name the plan, follow up in the same conversation, and inspect retained messages and fresh run identities.',
    recording:
      'Recorded in the real Angular workbench with OpenAI and actual Hashbrown text chat. No browser tools or generated component props. Messages remain in the current local instance; no persistence across refresh is demonstrated. Unchanged provider events are paced at 20 ms for filming; the normal host adds no delay. Footage slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-system-instructions-angular': {
    title: 'Angular workbench: system instructions.',
    caption:
      'Compare browser configuration with public server policy captured at the actual provider mapping boundary.',
    recording:
      'Recorded in the real Angular workbench with OpenAI and actual Hashbrown text chat. The endpoint replaces browser instructions; the inspector captures only the fixed public policy from the adapter mapping callback. Prompts do not grant authorization. No browser tools or application writes. Unchanged provider events are paced at 20 ms for filming; the normal host adds no delay. Footage slowed to half speed for readability. Replay makes no requests. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-prose-react': {
    title: 'React workbench: Prose.',
    caption:
      'Follow streamed Markdown into a formatted explanation, inspect a source reference, then ask for a shorter reply.',
    recording:
      'Recorded from the existing OpenAI capture through the renamed React prose workbench in read-only replay. The capture retains its original commit and recording time; lesson IDs and endpoint paths use prose. The original capture used the actual Hashbrown SDK and browser readContext tool. No new provider requests or writes. Playback uses recorded timing with bounded pauses. A source reference does not prove retrieval or correctness. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-predictions-react': {
    title: 'React workbench: predictive suggestions.',
    caption:
      'Dismiss a context-bound proposal, request fresh suggestions, then explicitly accept an action and follow up.',
    recording:
      'Recorded in the real React workbench with OpenAI streaming requests and the actual Hashbrown SDK. Suggestions are context-bound completions; only explicit acceptance changes application state. Unchanged provider events are paced at 20 ms for filming; the normal host adds no delay. Footage slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-ui-selection-react': {
    title: 'React workbench: UI selection.',
    caption:
      'Compare application-owned plan views, inspect the selected candidate and confidence, and explicitly use the view.',
    recording:
      'Recorded in the real React workbench with TypeSafe whole UI decisions and the actual Hashbrown SDK. The model chooses only a known candidate ID; components and plan props belong to the application. Footage slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-prose-angular': {
    title: 'Angular workbench: Prose.',
    caption:
      'Follow streamed Markdown into a formatted explanation, inspect a source reference, then ask for a shorter reply.',
    recording:
      'Recorded from the existing OpenAI capture through the renamed Angular prose workbench in read-only replay. The capture retains its original commit and recording time; lesson IDs and endpoint paths use prose. The original capture used the actual Hashbrown SDK and browser readContext tool. No new provider requests or writes. Playback uses recorded timing with bounded pauses. A source reference does not prove retrieval or correctness. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-predictions-angular': {
    title: 'Angular workbench: predictive suggestions.',
    caption:
      'Dismiss a context-bound proposal, request fresh suggestions, then explicitly accept an action and follow up.',
    recording:
      'Recorded in the real Angular workbench with OpenAI streaming requests and the actual Hashbrown SDK. Suggestions are context-bound completions; only explicit acceptance changes application state. Unchanged provider events are paced at 20 ms for filming; the normal host adds no delay. Footage slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-ui-selection-angular': {
    title: 'Angular workbench: UI selection.',
    caption:
      'Compare application-owned plan views, inspect the selected candidate and confidence, and explicitly use the view.',
    recording:
      'Recorded in the real Angular workbench with TypeSafe whole UI decisions and the actual Hashbrown SDK. The model chooses only a known candidate ID; components and plan props belong to the application. Footage slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },

  'canonical-workbench-debugging-react': {
    title: 'React workbench: debugging.',
    caption:
      'Inspect a local HTTP 403, retry in the same conversation, then accept and revise the plan.',
    recording:
      'Recorded in the real React workbench with OpenAI streaming requests and the actual Hashbrown SDK. The initial HTTP 403 is a deliberate local demo denial before provider work; it is not authentication or a provider failure. Unchanged provider events paced at 20 ms for filming. Footage slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-request-transformation-react': {
    title: 'React workbench: request transformation.',
    caption:
      'Compare the actual mapped request before and after server-owned instructions, then accept and revise the plan.',
    recording:
      'Recorded in the real React workbench with OpenAI streaming requests and the actual Hashbrown SDK. The before/after trace is captured inside the real provider transformation callback. Unchanged provider events paced at 20 ms for filming. Footage slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-debugging-angular': {
    title: 'Angular workbench: debugging.',
    caption:
      'Inspect a local HTTP 403, retry in the same conversation, then accept and revise the plan.',
    recording:
      'Recorded in the real Angular workbench with OpenAI streaming requests and the actual Hashbrown SDK. The initial HTTP 403 is a deliberate local demo denial before provider work; it is not authentication or a provider failure. Unchanged provider events paced at 20 ms for filming. Footage slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-request-transformation-angular': {
    title: 'Angular workbench: request transformation.',
    caption:
      'Compare the actual mapped request before and after server-owned instructions, then accept and revise the plan.',
    recording:
      'Recorded in the real Angular workbench with OpenAI streaming requests and the actual Hashbrown SDK. The before/after trace is captured inside the real provider transformation callback. Unchanged provider events paced at 20 ms for filming. Footage slowed to half speed for readability. Replay makes no requests or writes. No narration.',
    dimensions: { width: 1600, height: 1000 },
  },

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
  'canonical-workbench-threadplane-react': {
    title: 'Give the plan a React chat screen.',
    caption:
      'Stream two real replies through Threadplane, inspect the requests, and replay the same conversation.',
    recording:
      'Actual separately installed React TextTranscript and ChatInput with Hashbrown useChat and the real OpenAI server adapter. Real provider output, optional canonical inspector and timeline, actual-speed footage with reading pauses. No narration. Text does not apply application state; replay makes no requests or writes.',
    dimensions: { width: 1600, height: 1000 },
  },
  'canonical-workbench-threadplane-angular': {
    title: 'Give the plan an Angular chat screen.',
    caption:
      'Stream two real replies through Threadplane, inspect the requests, and replay the same conversation.',
    recording:
      'Actual separately installed Angular ChatComponent and Threadplane AG-UI frontend with the real Hashbrown OpenAI server adapter. Real provider output, optional canonical inspector and timeline, actual-speed footage with reading pauses. No narration. Text does not apply application state; replay makes no requests or writes.',
    dimensions: { width: 1600, height: 1000 },
  },
} as const satisfies Record<string, DocsDemoMedia>;

/** The stable identifier of a recorded documentation demo. */
export type DocsDemoId = keyof typeof DOCS_DEMOS;
