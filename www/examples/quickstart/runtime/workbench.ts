import {
  normalizeWorkbenchLocalModelObservation,
  type WorkbenchLocalModelObservation,
} from './workbench-local-models';
import {
  normalizeWorkbenchJavaScriptObservation,
  type WorkbenchJavaScriptObservation,
} from './workbench-javascript';
import {
  decodeWorkbenchUiDocument,
  extractWorkbenchUi,
  normalizeWorkbenchUiKit,
  type WorkbenchUiComponent,
  type WorkbenchUiKitInput,
  type WorkbenchUiKitObservation,
  type WorkbenchUiLesson,
} from './workbench-ui-kits';
import {
  decodeWorkbenchAuthoringDocument,
  normalizeWorkbenchAuthoringPlan,
  type WorkbenchAuthoringObservation,
  type WorkbenchAuthoringObservationInput,
} from './workbench-authoring';
import {
  decodeWorkbenchAgentTrace,
  type WorkbenchAgentTrace,
} from './workbench-agent';
import type { WorkbenchServerHistoryState } from './workbench-server-history';
import {
  canMutateWorkbenchHistory,
  createWorkbenchHistoryApp,
  isWorkbenchHistoryBusy,
  normalizeWorkbenchHistoryObservation,
  type WorkbenchHistoryApp,
  type WorkbenchHistoryFrame,
  type WorkbenchHistoryObservationInput,
  type WorkbenchHistoryReplacement,
} from './workbench-history';
import {
  normalizeWorkbenchWorkflowObservation,
  type WorkbenchWorkflowObservation,
  type WorkbenchWorkflowObservationInput,
} from './workbench-workflows';
import {
  workbenchInstructionsSystem,
  type WorkbenchInstructionsTrace,
} from './workbench-onboarding';
import {
  isWorkbenchRecipe,
  type WorkbenchActionId,
  type WorkbenchCitation,
  type WorkbenchRecipe,
  workbenchSelectionMinConfidence,
  type WorkbenchViewId,
} from './workbench-recipes';
import type { WorkbenchTransformationTrace } from './workbench-transformation';
export type { WorkbenchTransformationTrace } from './workbench-transformation';
import type { WorkbenchLessonId } from './workbench-lessons';
import { s } from '@hashbrownai/core';

/** A validated, application-owned plan, independent of rendered proposals. */
export interface WorkbenchPlan {
  readonly title: string;
  readonly steps: readonly string[];
}
/** The decoded decision and its model confidence. */
export interface WorkbenchDecision {
  readonly nextAction: 'record' | 'review' | 'clarify';
  readonly confidence: number;
}
/** The committed application snapshot. */
export interface WorkbenchApplication {
  readonly revision: number;
  readonly plan: WorkbenchPlan | null;
  readonly acceptedActions?: readonly WorkbenchActionId[];
  readonly selectedView?: WorkbenchViewId | null;
  readonly nextAction?: WorkbenchDecision['nextAction'] | null;
}
/** Runtime state for one captured user turn. */
export type WorkbenchStatus =
  'idle' | 'loading' | 'paused' | 'complete' | 'error' | 'cancelled';
/** The origin of an observable change in the canonical example. */
export type WorkbenchEventKind =
  | 'kit'
  | 'decision'
  | 'dismiss'
  | 'choose'
  | 'request'
  | 'event'
  | 'tool'
  | 'parsed'
  | 'accept'
  | 'error'
  | 'cancel'
  | 'complete'
  | 'user'
  | 'source'
  | 'response'
  | 'workflow'
  | 'form'
  | 'pause'
  | 'resume'
  | 'history'
  | 'history-app'
  | 'javascript'
  | 'local-model';
/** A frame captures everything needed for read-only historical playback. */
export interface WorkbenchFrame {
  readonly localModel?: WorkbenchLocalModelObservation;
  readonly uiComponent?: WorkbenchUiComponent;
  readonly uiKit?: WorkbenchUiKitObservation;
  readonly history?: WorkbenchHistoryFrame;
  readonly workflow?: WorkbenchWorkflowObservation;
  readonly javascript?: WorkbenchJavaScriptObservation;
  readonly sequence: number;
  readonly turn: number;
  readonly kind: WorkbenchEventKind;
  readonly payload: unknown;
  readonly source: string;
  readonly elapsedMs: number;
  readonly application: WorkbenchApplication;
  readonly messages: readonly {
    readonly id: string;
    readonly role: 'user' | 'assistant';
    readonly content: string;
    readonly props?: WorkbenchFrame['props'];
    readonly uiComponent?: WorkbenchUiComponent;
    readonly decision?: WorkbenchDecision;
    readonly recipe?: WorkbenchRecipe;
  }[];
  readonly decision?: WorkbenchDecision;
  readonly recipe?: WorkbenchRecipe;
  readonly citation?: WorkbenchCitation & { readonly origin: string };
  readonly dismissedPredictions?: readonly WorkbenchActionId[];
  readonly transformation?: WorkbenchTransformationTrace;
  readonly instructions?: WorkbenchInstructionsTrace;
  readonly json: string;
  readonly props: {
    readonly title?: string;
    readonly steps?: readonly string[];
  } | null;
  readonly status: WorkbenchStatus;
}
/** Each event also contains its immutable presentation frame. */
export type WorkbenchEvent = WorkbenchFrame;
/** A live trace or its selected historical frame. */
export interface WorkbenchSnapshot {
  readonly events: readonly WorkbenchEvent[];
  readonly cursor: number | null;
  readonly turn: number;
  readonly status: WorkbenchStatus;
  readonly application: WorkbenchApplication;
  readonly frame: WorkbenchFrame | null;
}
/** The shared recording boundary used by the two real SDK clients. */
export interface WorkbenchStore {
  /** Starts a distinct live preparation origin without generating a user turn. */
  beginLocalPreparation(operationId: string): boolean;
  /** Captures only fresh preparation observations; replay and superseded origins are inert. */
  recordLocalPreparation(observation: unknown): boolean;
  /** Captures safe metadata from the actual normalized SDK kit, deduplicated across renders. */
  recordUiKit(input: WorkbenchUiKitInput): boolean;
  /** Captures actual parser values against the current SDK assistant identity. */
  recordAuthoring(observation: WorkbenchAuthoringObservationInput): boolean;
  /** Copies a fresh valid document for explicit review. */
  reviewAuthoring(): boolean;
  /** Changes only the reviewed application fields. */
  editAuthoring(field: 'title' | 'step-0' | 'step-1', value: string): boolean;
  /** Applies a fresh successful valid review once. */
  applyAuthoring(): boolean;
  /** Captures actual SDK text history and lifecycle, including idle setter replacements. */
  recordHistory(observation: WorkbenchHistoryObservationInput): boolean;
  /** Captures explicit application text actions; replay and active SDK work are inert. */
  recordHistoryApp(app: WorkbenchHistoryApp, action: string): boolean;
  /** Captures safe server observations during requests without changing SDK lifecycle or replacement intent. */
  recordServerHistory(
    server: WorkbenchServerHistoryState,
    action: string,
  ): boolean;
  /** Releases failed/cancelled replacement intent without claiming the SDK transcript changed. */
  failHistoryReplacement(error?: unknown): boolean;
  /** Captures actual SDK state, messages, activities, pending batch and lifecycle flags. */
  recordWorkflow(observation: WorkbenchWorkflowObservationInput): boolean;
  /** Records intent before calling the synchronous SDK resume API; adds no user message. */
  beginResume(batchId: string): boolean;
  /** Restores the paused form after synchronous SDK validation rejects resume. */
  failResume(): void;
  /** Captures bounded runtime facts only for the live loading user action. */
  recordJavaScript(observation: unknown, userId: string): boolean;
  getSnapshot(): WorkbenchSnapshot;
  subscribe(listener: () => void): () => void;
  send(content: string): { id: string; role: 'user'; content: string };
  record(kind: WorkbenchEventKind, payload: unknown, requestId?: string): void;
  parsed(ui: unknown): void;
  settle(
    status: 'complete' | 'error' | 'cancelled',
    finishReason?: string,
  ): void;
  /** Captures a validated observation only for the current loading recipe request. */
  recordRecipe(reply: WorkbenchRecipe, requestId: string): boolean;
  /** Applies a fresh completed proposal once, advancing the application revision. */
  acceptPrediction(id: WorkbenchActionId): boolean;
  /** Records presentation-only dismissal without applying an action or advancing the revision. */
  dismissPrediction(id: WorkbenchActionId): boolean;
  /** Applies a fresh completed candidate only when its confidence satisfies application policy. */
  applySelection(): boolean;
  /** Captures an explicit manual view choice and invalidates pending captures; clients abort active SDK work first. */
  manualSelection(id: WorkbenchViewId): boolean;
  /** Records reference inspection without changing the application plan. */
  inspectCitation(data: WorkbenchCitation, origin: string): boolean;
  recordDecision(result: WorkbenchDecision, requestId: string): void;
  applyDecision(): boolean;
  accept(proposal: WorkbenchPlan): boolean;
  seek(index: number): void;
  live(): void;
  clear(): void;
}

/** SDK instructions are fixed by the server as well as shown in the checked clients. */
export const workbenchSystem =
  'You help a developer create a small two-step plan. Before every answer call readContext exactly once to read the current application revision and accepted plan. Render exactly one SummaryCard with a short title and exactly two concise steps. The first request should create a plan with outline and record steps. A follow-up requesting a shorter second step should revise that step while retaining the first step verbatim. Rendering does not apply a plan; only the user accepts it. Do not claim application state changed.';

/** Plain typed plan shared by the real structured clients and server. */
export const workbenchPlanSchema = s.object('A two-step plan proposal', {
  title: s.string('A concise plan title'),
  steps: s.streaming.array(
    'Exactly two concise steps',
    s.string('A clear action'),
  ),
});
/** Plan schema that streams its title as well as its step array. */
export const workbenchStreamingPlanSchema = s.object(
  'A two-step plan proposal',
  {
    title: s.streaming.string('A concise plan title'),
    steps: s.streaming.array(
      'Exactly two concise steps',
      s.string('A clear action'),
    ),
  },
);
/** Selects the schema owned by the allowlisted lesson. */
export function getWorkbenchPlanSchema(lessonId: WorkbenchLessonId) {
  return lessonId === 'streaming'
    ? workbenchStreamingPlanSchema
    : workbenchPlanSchema;
}
/** The bounded options the decision model can suggest. */
export const workbenchDecisionSchema = s.object(
  'Choose the next action for this plan',
  {
    nextAction: s.enumeration('The next useful action', {
      record: 'Record the demo after the outline is complete.',
      review: 'Review the demo after it has been recorded.',
      clarify: 'Ask for clarification when progress is unclear.',
    }),
  },
);
/** App-owned plan supplied as context to the decision model. */
export const workbenchDecisionPlan: WorkbenchPlan = {
  title: 'Show how a model renders trusted UI',
  steps: ['Outline the trusted UI demo.', 'Record the demo.'],
};
/** User actions that start the independent decision turns. */
export const workbenchDecisionPrompts = [
  'The outline is complete. What should I do next?',
  'The demo is recorded. What should I do next?',
] as const;
/** Server-owned decision policy; suggestions never change application state. */
export const workbenchDecisionSystem =
  'Choose the next useful action from the supplied application snapshot and progress prompt. When the outline is complete choose record. When the demo is recorded choose review. If progress is unclear choose clarify. Suggest only; the user must explicitly use the suggestion.';
/** Fixed instructions for plain structured output and explicit application review. */
export const workbenchStructuredSystem =
  'You help a developer create a small two-step plan. Before every answer call readContext exactly once to read the current application revision and accepted plan. Return a plain typed plan with a short title and exactly two concise steps. The first request should create a plan with outline and record steps. A follow-up requesting a shorter second step should revise that step while retaining the first step verbatim. Returning data does not apply a plan; only the user accepts it. Do not claim application state changed.';
/** Extracts only plain structured plan fields, never a generated component tree. */
export function workbenchStructuredProps(
  value: unknown,
): WorkbenchFrame['props'] {
  const props = object(value);
  if (
    !props ||
    Object.keys(props).some((key) => key !== 'title' && key !== 'steps')
  )
    return null;
  const result = {
    ...(typeof props['title'] === 'string' ? { title: props['title'] } : {}),
    ...(Array.isArray(props['steps']) &&
    props['steps'].every((step) => typeof step === 'string')
      ? { steps: [...props['steps']] as string[] }
      : {}),
  };
  return Object.keys(result).length > 0 ? result : null;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function copy<T>(value: T): T {
  return structuredClone(value);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
/** Extracts resolved props from Hashbrown's native trusted component tree. */
export function workbenchProps(value: unknown): WorkbenchFrame['props'] {
  const ui = object(value)?.['ui'];
  if (!Array.isArray(ui) || ui.length !== 1) return null;
  const node = object(ui[0]);
  if (!node || Object.keys(node).length !== 1) return null;
  const field = object(object(node['SummaryCard'])?.['props']);
  if (!field) return null;
  const props =
    object(field['value']) ?? object(field['partialValue']) ?? field;
  return {
    ...(typeof props['title'] === 'string' ? { title: props['title'] } : {}),
    ...(Array.isArray(props['steps']) &&
    props['steps'].every((s) => typeof s === 'string')
      ? { steps: [...props['steps']] as string[] }
      : {}),
  };
}
/** Checks the same bounded two-step contract at rendering and application action boundaries. */
export function isWorkbenchPlan(input: unknown): input is WorkbenchPlan {
  const value = object(input);
  return (
    !!value &&
    typeof value['title'] === 'string' &&
    value['title'].trim().length > 0 &&
    value['title'].length <= 120 &&
    Array.isArray(value['steps']) &&
    value['steps'].length === 2 &&
    value['steps'].every(
      (step) =>
        typeof step === 'string' &&
        step.trim().length > 0 &&
        step.length <= 200,
    )
  );
}

/** Identifies the live user request before a decision runtime can publish or settle it. */
export function isCurrentWorkbenchDecision(
  snapshot: WorkbenchSnapshot,
  requestId: string,
): boolean {
  return (
    snapshot.status === 'loading' &&
    snapshot.frame?.messages.filter((message) => message.role === 'user').at(-1)
      ?.id === requestId
  );
}

/** Associates SDK errors with the captured user turn before allowing them to settle it. */
export function isCurrentWorkbenchError(
  snapshot: WorkbenchSnapshot,
  messages: readonly { readonly id?: string; readonly role: string }[],
  error?: unknown,
  previousError?: unknown,
): boolean {
  const user = messages.filter((message) => message.role === 'user').at(-1)?.id;
  return (
    snapshot.status === 'loading' &&
    !(error !== undefined && error === previousError) &&
    !!user &&
    snapshot.frame?.messages.filter((message) => message.role === 'user').at(-1)
      ?.id === user
  );
}

/** Reads explicit application choice events to identify an already-used suggestion. */
export function wasWorkbenchDecisionApplied(
  snapshot: WorkbenchSnapshot,
  messageId: string,
): boolean {
  return snapshot.events.some(
    (event) =>
      event.kind === 'choose' && event.messages.at(-1)?.id === messageId,
  );
}

/** Creates an isolated capture. Seeking changes only the selected frame, never live state. Authoring review and Apply require the explicit form mode. */
export function createWorkbenchStore(
  format:
    | 'ui'
    | 'structured'
    | 'decision'
    | 'text'
    | 'predictions'
    | 'selection'
    | 'workflow'
    | 'history' = 'ui',
  options: {
    readonly localModel?: boolean;
    readonly authoringMode?: 'parser' | 'form';
    readonly uiLesson?: WorkbenchUiLesson;
  } = {},
): WorkbenchStore {
  const initialApplication = (): WorkbenchApplication =>
    freeze(
      [
        'decision',
        'text',
        'predictions',
        'selection',
        'workflow',
        'history',
      ].includes(format)
        ? {
            revision: 0,
            plan: copy(workbenchDecisionPlan),
            nextAction: null,
            ...(format === 'predictions' ? { acceptedActions: [] } : {}),
            ...(format === 'selection' ? { selectedView: null } : {}),
          }
        : { revision: 0, plan: null },
    );
  let application = initialApplication();
  let localModel: WorkbenchLocalModelObservation | undefined;
  let localPreparationId: string | null = null;
  let localSource = false;
  let uiKit: WorkbenchUiKitObservation | undefined;
  let uiComponent: WorkbenchUiComponent | undefined;
  let uiRevision = -1;
  let history: WorkbenchHistoryFrame | undefined;
  let authoring: WorkbenchAuthoringObservation | undefined;
  let latestSentUserId: string | null = null;
  let agent: WorkbenchAgentTrace | undefined;
  let historySuccess = false;
  let replacementBaseline = '';
  let replacementObservedBusy = false;
  let workflow: WorkbenchWorkflowObservation | undefined;
  let javascript: WorkbenchJavaScriptObservation | undefined;
  let resumeIntent = false;
  let decision: WorkbenchDecision | undefined;
  let decisionRevision = -1;
  let recipe: WorkbenchRecipe | undefined;
  let recipeRevision = -1;
  let citation: (WorkbenchCitation & { readonly origin: string }) | undefined;
  let dismissedPredictions: readonly WorkbenchActionId[] = [];
  let transformation: WorkbenchTransformationTrace | undefined;
  let instructions: WorkbenchInstructionsTrace | undefined;
  let events: readonly WorkbenchEvent[] = [];
  let cursor: number | null = null;
  let turn = 0;
  let status: WorkbenchStatus = 'idle';
  let messages: WorkbenchFrame['messages'] = [];
  let json = '';
  let props: WorkbenchFrame['props'] = null;
  let propsReady = false;
  let finishReason: string | undefined;
  let started = 0;
  let appliedTurn = -1;
  let generation = 0;
  let snapshot: WorkbenchSnapshot;
  const listeners = new Set<() => void>();
  const notify = () => {
    snapshot = freeze({
      events,
      cursor,
      turn,
      status,
      application,
      frame:
        cursor === null ? (events.at(-1) ?? null) : (events[cursor] ?? null),
    });
    listeners.forEach((listener) => listener());
  };
  const record = (kind: WorkbenchEventKind, payload: unknown) => {
    if (
      (turn === 0 &&
        kind !== 'kit' &&
        kind !== 'local-model' &&
        kind !== 'workflow' &&
        kind !== 'history' &&
        kind !== 'history-app' &&
        !(format === 'workflow' && kind === 'form')) ||
      (status !== 'loading' &&
        ['event', 'request', 'response', 'source', 'tool', 'parsed'].includes(
          kind,
        ))
    )
      return;
    if (events.length >= 2000) {
      status = 'error';
      finishReason = undefined;
      notify();
      return;
    }
    const raw = object(payload);
    if (kind === 'source') localSource = raw?.['source'] === 'local-model';
    if ((format === 'decision' || format === 'selection') && kind === 'event')
      json = JSON.stringify(payload, null, 2);
    if (kind === 'request') {
      json = '';
      transformation = undefined;
      instructions = undefined;
    }
    if (
      kind === 'event' &&
      raw?.['type'] === 'CUSTOM' &&
      raw['name'] === 'workbench.request-transformation'
    )
      transformation = copy(raw['value'] as WorkbenchTransformationTrace);
    if (
      kind === 'event' &&
      raw?.['type'] === 'CUSTOM' &&
      raw['name'] === 'workbench.system-instructions'
    ) {
      const value = object(raw['value']);
      if (
        value?.['origin'] === 'OpenAI adapter mapping' &&
        value['policy'] === workbenchInstructionsSystem
      )
        instructions = {
          origin: 'OpenAI adapter mapping',
          policy: workbenchInstructionsSystem,
        };
    }
    if (
      kind === 'event' &&
      raw?.['type'] === 'CUSTOM' &&
      raw['name'] === 'workbench.agent-decision'
    )
      agent = decodeWorkbenchAgentTrace(raw['value']) ?? undefined;
    if (kind === 'event' && raw?.['type'] === 'TEXT_MESSAGE_START') json = '';
    if (
      kind === 'event' &&
      raw?.['type'] === 'TEXT_MESSAGE_CONTENT' &&
      typeof raw['delta'] === 'string'
    ) {
      json += raw['delta'];
      const id =
        typeof raw['messageId'] === 'string'
          ? raw['messageId']
          : `assistant-${turn}`;
      const previous = messages.find((message) => message.id === id);
      messages = [
        ...messages.filter((m) => m.id !== id),
        { ...previous, id, role: 'assistant', content: json },
      ];
    }
    const frame: WorkbenchFrame = freeze(
      copy({
        ...(localModel ? { localModel } : {}),
        ...(uiKit ? { uiKit } : {}),
        ...(uiComponent ? { uiComponent } : {}),
        sequence: events.length + 1,
        turn,
        kind,
        payload,
        source:
          kind === 'local-model'
            ? 'Native model preparation'
            : kind === 'javascript'
              ? 'JavaScript runtime observation'
              : kind === 'kit'
                ? 'Kit configuration'
                : kind === 'parsed'
                  ? 'SDK parsed output'
                  : kind === 'history'
                    ? 'SDK history observation'
                    : kind === 'workflow' ||
                        (kind === 'pause' && raw && 'isLoading' in raw)
                      ? 'SDK workflow observation'
                      : kind === 'event' || kind === 'request'
                        ? 'Browser transport'
                        : 'Application',
        elapsedMs:
          (kind === 'kit' || kind === 'local-model') && turn === 0
            ? 0
            : Math.round(Math.max(0, performance.now() - started)),
        application,
        ...(decision ? { decision } : {}),
        ...(recipe ? { recipe } : {}),
        ...(citation ? { citation } : {}),
        dismissedPredictions,
        ...(transformation ? { transformation } : {}),
        ...(instructions ? { instructions } : {}),
        messages,
        ...(history
          ? {
              history: {
                ...history,
                successfulGeneration: historySuccess,
                ...(authoring ? { authoring } : {}),
                ...(agent ? { agent } : {}),
              },
            }
          : {}),
        ...(workflow ? { workflow } : {}),
        ...(javascript ? { javascript } : {}),
        json,
        props,
        status,
      }),
    );
    events = [...events, frame];
    notify();
  };
  const recipeReady = () =>
    cursor === null &&
    status === 'complete' &&
    finishReason === 'stop' &&
    recipeRevision === application.revision &&
    !!recipe;
  const commitView = (id: WorkbenchViewId, manual: boolean) => {
    application = freeze(
      copy({
        ...application,
        revision: application.revision + 1,
        selectedView: id,
      }),
    );
    appliedTurn = turn;
    record('choose', { selectedView: id, manual });
    return true;
  };
  notify();
  const currentAuthoringSource = () => {
    if (!history || !authoring) return false;
    const sdkMessages = history.sdk.messages;
    const userIndex = sdkMessages.reduce(
      (index, message, current) =>
        message['role'] === 'user' ? current : index,
      -1,
    );
    const requestUser = latestSentUserId;
    const assistant = sdkMessages
      .slice(userIndex + 1)
      .filter((message) => message['role'] === 'assistant')
      .at(-1);
    return (
      !!requestUser &&
      sdkMessages[userIndex]?.['id'] === requestUser &&
      !!authoring.origin.assistantId &&
      assistant?.['id'] === authoring.origin.assistantId &&
      assistant?.['content'] === authoring.json
    );
  };
  const authoringReady = () =>
    options.authoringMode === 'form' &&
    cursor === null &&
    status === 'complete' &&
    finishReason === 'stop' &&
    historySuccess &&
    history?.sdk.finishReason === 'stop' &&
    !history.sdk.error &&
    !history.sdk.recoveryRequired &&
    !history.sdk.pendingInterrupts &&
    currentAuthoringSource() &&
    !history?.replacement &&
    !isWorkbenchHistoryBusy(history?.sdk) &&
    authoring?.source === 'complete' &&
    authoring.parser.complete &&
    !authoring.parser.error &&
    !!authoring.document &&
    authoring.origin.turn === turn &&
    authoring.origin.revision === application.revision &&
    !authoring.applied;
  return {
    recordUiKit(input) {
      if (!options.uiLesson || format !== 'ui' || cursor !== null) return false;
      const next = normalizeWorkbenchUiKit(input);
      if (JSON.stringify(next) === JSON.stringify(uiKit)) return false;
      uiKit = freeze(copy(next));
      record('kit', uiKit);
      return true;
    },
    recordAuthoring(input) {
      if (
        format !== 'history' ||
        cursor !== null ||
        !history ||
        history.replacement
      )
        return false;
      const sdkMessages = history.sdk.messages;
      const currentUser = latestSentUserId;
      const userIndex = sdkMessages.reduce(
        (index, message, current) =>
          message['role'] === 'user' ? current : index,
        -1,
      );
      const assistant = sdkMessages
        .slice(userIndex + 1)
        .filter((message) => message['role'] === 'assistant')
        .at(-1);
      if (
        turn > 0 &&
        (sdkMessages[userIndex]?.['id'] !== currentUser ||
          !input.assistantId ||
          assistant?.['id'] !== input.assistantId ||
          assistant?.['content'] !== input.json)
      )
        return false;
      const source =
        turn === 0
          ? 'idle'
          : status === 'cancelled'
            ? 'stopped'
            : history.sdk.error ||
                history.sdk.recoveryRequired ||
                status === 'error'
              ? 'error'
              : isWorkbenchHistoryBusy(history.sdk) || status === 'loading'
                ? 'generating'
                : historySuccess && history.sdk.finishReason === 'stop'
                  ? 'complete'
                  : 'stopped';
      const error =
        input.error == null
          ? null
          : input.error instanceof Error
            ? input.error.message
            : String(input.error);
      const same =
        authoring?.origin.turn === turn &&
        authoring.origin.assistantId === input.assistantId &&
        authoring.json === input.json;
      const next: WorkbenchAuthoringObservation = {
        origin: {
          turn,
          revision:
            same && authoring
              ? authoring.origin.revision
              : application.revision,
          assistantId: input.assistantId,
        },
        source,
        json: input.json,
        parser: {
          value: error || source === 'error' ? null : input.value,
          complete: input.complete,
          error,
        },
        document:
          source === 'complete' &&
          input.complete &&
          !error &&
          normalizeWorkbenchAuthoringPlan(input.value)
            ? decodeWorkbenchAuthoringDocument(input.json)
            : null,
        reviewed: same && authoring ? authoring.reviewed : null,
        applied: same && authoring ? authoring.applied : false,
        error: null,
      };
      if (JSON.stringify(next) === JSON.stringify(authoring)) return false;
      authoring = copy(next);
      record('history', { authoring });
      return true;
    },
    reviewAuthoring() {
      if (!authoringReady() || !authoring) return false;
      authoring = {
        ...authoring,
        reviewed: copy(authoring.document),
        error: null,
      };
      record('history-app', { action: 'review-authoring' });
      return true;
    },
    editAuthoring(field, value) {
      if (
        !authoringReady() ||
        !authoring?.reviewed ||
        typeof value !== 'string' ||
        !['title', 'step-0', 'step-1'].includes(field)
      )
        return false;
      const reviewed =
        field === 'title'
          ? { ...authoring.reviewed, title: value }
          : {
              ...authoring.reviewed,
              steps: authoring.reviewed.steps.map((step, index) =>
                index === Number(field.slice(-1)) ? value : step,
              ),
            };
      authoring = { ...authoring, reviewed, error: null };
      record('history-app', { action: 'edit-authoring', field });
      return true;
    },
    applyAuthoring() {
      if (!authoringReady() || !authoring?.reviewed || appliedTurn === turn)
        return false;
      const plan = normalizeWorkbenchAuthoringPlan(authoring.reviewed);
      if (!plan) {
        authoring = {
          ...authoring,
          error:
            'Use a title of 1–120 characters and exactly two steps of 1–200 characters each.',
        };
        record('history-app', { action: 'invalid-authoring' });
        return false;
      }
      application = freeze(
        copy({ ...application, revision: application.revision + 1, plan }),
      );
      appliedTurn = turn;
      authoring = { ...authoring, applied: true, error: null };
      record('history-app', { action: 'apply-authoring' });
      return true;
    },
    recordHistory(observation) {
      if (format !== 'history' || cursor !== null) return false;
      const sdk = normalizeWorkbenchHistoryObservation(observation);
      const observedUser = sdk.messages
        .filter((message) => message['role'] === 'user')
        .at(-1)?.['id'];
      const currentUser = messages
        .filter((message) => message.role === 'user')
        .at(-1)?.id;
      if (status === 'loading' && observedUser !== currentUser) return false;
      const busy = isWorkbenchHistoryBusy(sdk);
      if (history?.replacement && busy) replacementObservedBusy = true;
      const replacement =
        history?.replacement &&
        !(
          !busy &&
          (replacementObservedBusy ||
            JSON.stringify(sdk.messages) !== replacementBaseline)
        )
          ? history.replacement
          : null;
      if (
        JSON.stringify(sdk) === JSON.stringify(history?.sdk) &&
        replacement === history?.replacement
      )
        return false;
      if (
        sdk.error ||
        sdk.recoveryRequired ||
        sdk.pendingInterrupts ||
        (sdk.finishReason && sdk.finishReason !== 'stop')
      )
        historySuccess = false;
      history = {
        replacement,
        sdk,
        app: history?.app ?? createWorkbenchHistoryApp(),
        successfulGeneration: historySuccess,
      };
      messages = sdk.messages.flatMap((message) =>
        typeof message['id'] === 'string' &&
        (message['role'] === 'user' || message['role'] === 'assistant') &&
        typeof message['content'] === 'string'
          ? [
              {
                id: message['id'],
                role: message['role'],
                content: message['content'],
              },
            ]
          : [],
      );
      record('history', sdk);
      return true;
    },
    recordServerHistory(server, action) {
      if (format !== 'history' || !history || cursor !== null) return false;
      history = { ...history, app: copy({ ...history.app, server }) };
      record('history-app', { action });
      return true;
    },
    recordHistoryApp(app, action) {
      if (
        format !== 'history' ||
        !history ||
        !canMutateWorkbenchHistory(snapshot)
      )
        return false;
      const replacement = ['clear', 'restore', 'load'].includes(action)
        ? (action as WorkbenchHistoryReplacement)
        : null;
      if (replacement) {
        historySuccess = false;
        replacementBaseline = JSON.stringify(history.sdk.messages);
        replacementObservedBusy = false;
      }
      history = {
        ...history,
        replacement,
        app: copy({ ...app, action }),
        successfulGeneration: historySuccess,
      };
      record('history-app', { action });
      return true;
    },
    failHistoryReplacement(error) {
      if (format !== 'history' || cursor !== null || !history?.replacement)
        return false;
      const action = `${history.replacement}-failed`;
      const message =
        error === undefined
          ? 'Text replacement cancelled.'
          : error instanceof Error
            ? error.message
            : String(error);
      history = {
        ...history,
        replacement: null,
        app: { ...history.app, action, error: message },
      };
      replacementBaseline = '';
      replacementObservedBusy = false;
      record('history-app', { action, error: message });
      return true;
    },
    recordWorkflow(observation) {
      if (format !== 'workflow' || cursor !== null) return false;
      const next = normalizeWorkbenchWorkflowObservation(observation);
      const observedUser = next.messages
        .filter((message) => message.role === 'user')
        .at(-1)?.id;
      const currentUser = messages
        .filter((message) => message.role === 'user')
        .at(-1)?.id;
      if (turn > 0 && observedUser !== currentUser) return false;
      if (JSON.stringify(next) === JSON.stringify(workflow)) return false;
      workflow = next;
      if (next.isResuming || next.error || next.recoveryRequired)
        resumeIntent = false;
      const paused =
        !!next.pendingInterrupts &&
        !next.isLoading &&
        !next.isResuming &&
        !next.recoveryRequired &&
        !resumeIntent;
      if (paused) {
        status = 'paused';
        resumeIntent = false;
      }
      record(paused ? 'pause' : 'workflow', workflow);
      return true;
    },
    beginResume(batchId) {
      if (
        format !== 'workflow' ||
        cursor !== null ||
        status !== 'paused' ||
        resumeIntent ||
        workflow?.recoveryRequired ||
        workflow?.pendingInterrupts?.id !== batchId
      )
        return false;
      resumeIntent = true;
      status = 'loading';
      record('resume', { batchId, intent: true });
      return true;
    },
    failResume() {
      if (!resumeIntent || !workflow?.pendingInterrupts) return;
      resumeIntent = false;
      status = 'paused';
      record('pause', { synchronousValidationRejected: true });
    },
    recordJavaScript(observation, userId) {
      if (
        format !== 'text' ||
        cursor !== null ||
        status !== 'loading' ||
        latestSentUserId !== userId
      )
        return false;
      const next = normalizeWorkbenchJavaScriptObservation(observation);
      if (!next || JSON.stringify(next) === JSON.stringify(javascript))
        return false;
      javascript = next;
      record('javascript', javascript);
      return true;
    },
    beginLocalPreparation(operationId) {
      const next = normalizeWorkbenchLocalModelObservation({
        operationId,
        state: 'preparing',
      });
      if (
        !next ||
        cursor !== null ||
        status === 'loading' ||
        status === 'paused'
      )
        return false;
      localPreparationId = operationId;
      localModel = next;
      record('local-model', next);
      return true;
    },
    recordLocalPreparation(observation) {
      const next = normalizeWorkbenchLocalModelObservation(observation);
      if (
        !next ||
        cursor !== null ||
        !localPreparationId ||
        next.operationId !== localPreparationId
      )
        return false;
      if (JSON.stringify(next) === JSON.stringify(localModel)) return false;
      localModel = next;
      if (next.state !== 'preparing') localPreparationId = null;
      record('local-model', next);
      return true;
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    send(content) {
      const text = content.trim();
      if (
        cursor !== null ||
        status === 'loading' ||
        (format === 'history' &&
          (!!history?.replacement ||
            isWorkbenchHistoryBusy(history?.sdk) ||
            !!history?.sdk.pendingInterrupts ||
            !!history?.sdk.recoveryRequired)) ||
        status === 'paused' ||
        !text ||
        text.length > 2000
      )
        throw new Error(
          'Return to live mode and finish the current turn before sending.',
        );
      localPreparationId = null;
      localSource = false;
      if (turn === 0) started = performance.now();
      turn++;
      status = 'loading';
      props = null;
      uiComponent = undefined;
      uiRevision = application.revision;
      decision = undefined;
      recipe = undefined;
      citation = undefined;
      dismissedPredictions = [];
      transformation = undefined;
      instructions = undefined;
      propsReady = false;
      json = '';
      finishReason = undefined;
      historySuccess = false;
      javascript = undefined;
      authoring = undefined;
      agent = undefined;
      const message = {
        id: `workbench-${generation}-${turn}`,
        role: 'user' as const,
        content: text,
      };
      latestSentUserId = message.id;
      messages = [...messages, message];
      record('user', message);
      return message;
    },
    record(kind, payload) {
      if (cursor !== null) return;
      record(kind, payload);
    },
    recordRecipe(reply, requestId) {
      if (
        cursor !== null ||
        status !== 'loading' ||
        messages.filter((message) => message.role === 'user').at(-1)?.id !==
          requestId ||
        !isWorkbenchRecipe(reply) ||
        (
          {
            text: 'text',
            predictions: 'predictions',
            selection: 'selection',
          } as Record<string, string>
        )[format] !== reply.kind
      )
        return false;
      // Copy only the typed POJO fields, excluding accidental runtime properties.
      recipe = freeze(
        copy(
          reply.kind === 'text'
            ? { kind: reply.kind, markdown: reply.markdown }
            : reply.kind === 'predictions'
              ? {
                  kind: reply.kind,
                  contextId: reply.contextId,
                  suggestions: reply.suggestions.map(
                    ({ actionId, reason }) => ({ actionId, reason }),
                  ),
                }
              : {
                  kind: reply.kind,
                  selected: [...reply.selected],
                  confidence: reply.confidence,
                },
        ),
      );
      recipeRevision = application.revision;
      const id =
        reply.kind === 'text' && messages.at(-1)?.role === 'assistant'
          ? (messages.at(-1)?.id ?? `recipe-${requestId}`)
          : `recipe-${requestId}`;
      const previous = messages.find((message) => message.id === id);
      messages = [
        ...messages.filter((message) => message.id !== id),
        {
          ...previous,
          id,
          role: 'assistant',
          content: reply.kind === 'text' ? reply.markdown : json,
          recipe,
        },
      ];
      record('parsed', recipe);
      return true;
    },
    acceptPrediction(id) {
      if (
        format !== 'predictions' ||
        !recipeReady() ||
        recipe?.kind !== 'predictions' ||
        recipe.contextId !==
          messages.filter((message) => message.role === 'user').at(-1)?.id ||
        dismissedPredictions.includes(id) ||
        application.acceptedActions?.includes(id) ||
        !recipe.suggestions.some((suggestion) => suggestion.actionId === id)
      )
        return false;
      application = freeze(
        copy({
          ...application,
          revision: application.revision + 1,
          nextAction: id,
          acceptedActions: [...(application.acceptedActions ?? []), id],
        }),
      );
      record('choose', { actionId: id });
      return true;
    },
    dismissPrediction(id) {
      if (
        !recipeReady() ||
        recipe?.kind !== 'predictions' ||
        recipe.contextId !==
          messages.filter((message) => message.role === 'user').at(-1)?.id ||
        dismissedPredictions.includes(id) ||
        !recipe.suggestions.some((suggestion) => suggestion.actionId === id)
      )
        return false;
      dismissedPredictions = [...dismissedPredictions, id];
      record('dismiss', { dismissed: id, presentationOnly: true });
      return true;
    },
    applySelection() {
      if (
        format !== 'selection' ||
        !recipeReady() ||
        recipe?.kind !== 'selection' ||
        recipe.selected.length !== 1 ||
        recipe.confidence < workbenchSelectionMinConfidence ||
        appliedTurn === turn
      )
        return false;
      return commitView(recipe.selected[0], false);
    },
    manualSelection(id) {
      if (
        format !== 'selection' ||
        cursor !== null ||
        !['summary', 'steps'].includes(id)
      )
        return false;
      if (turn === 0) {
        started = performance.now();
        turn = 1;
      }
      if (status === 'loading') {
        status = 'cancelled';
        finishReason = undefined;
        record('cancel', { manual: true });
      }
      return commitView(id, true);
    },
    inspectCitation(data, origin) {
      if (
        format !== 'text' ||
        cursor !== null ||
        !messages.some(
          (message) => message.id === origin && message.role === 'assistant',
        ) ||
        typeof data.id !== 'string' ||
        !Number.isSafeInteger(data.number) ||
        data.number < 1 ||
        typeof data.url !== 'string' ||
        data.url.length > 2000
      )
        return false;
      citation = freeze({
        id: data.id,
        number: data.number,
        url: data.url,
        origin,
      });
      record('choose', { citation });
      return true;
    },
    parsed(value) {
      if (status !== 'loading') return;
      const extracted =
        options.uiLesson && format === 'ui'
          ? extractWorkbenchUi(value, options.uiLesson)
          : null;
      const next =
        options.uiLesson && format === 'ui'
          ? (extracted?.props ?? null)
          : format === 'structured'
            ? workbenchStructuredProps(value)
            : workbenchProps(value);
      const ui = object(value)?.['ui'];
      const field = Array.isArray(ui)
        ? object(object(object(ui[0])?.['SummaryCard'])?.['props'])
        : undefined;
      const ready =
        options.uiLesson && format === 'ui'
          ? extracted?.ready === true
          : format === 'structured'
            ? isWorkbenchPlan(next)
            : !!field && (!('complete' in field) || field['complete'] === true);
      if (
        JSON.stringify(next) === JSON.stringify(props) &&
        propsReady === ready &&
        (!options.uiLesson || uiComponent === extracted?.component)
      )
        return;
      props = next;
      uiComponent = extracted?.component;
      propsReady = ready;
      const assistant = [...messages]
        .reverse()
        .find((message) => message.role === 'assistant');
      if (assistant && messages.at(-1)?.role === 'assistant')
        messages = messages.map((message) =>
          message.id === assistant.id
            ? {
                ...message,
                props: next,
                ...(options.uiLesson ? { uiComponent } : {}),
              }
            : message,
        );
      else
        messages = [
          ...messages,
          {
            id: `parsed-${generation}-${turn}`,
            role: 'assistant',
            content: json,
            props: next,
            ...(uiComponent ? { uiComponent } : {}),
          },
        ];
      record('parsed', value);
    },
    settle(next, reason) {
      if (status !== 'loading') return;
      status = next;
      finishReason = reason;
      if (format === 'history')
        historySuccess =
          next === 'complete' &&
          reason === 'stop' &&
          !!history &&
          !history.sdk.error &&
          !history.sdk.recoveryRequired &&
          !history.sdk.pendingInterrupts;
      record(
        next === 'complete'
          ? 'complete'
          : next === 'error'
            ? 'error'
            : 'cancel',
        { status: next, finishReason: reason },
      );
    },
    recordDecision(result, requestId) {
      if (
        format !== 'decision' ||
        status !== 'loading' ||
        messages.filter((message) => message.role === 'user').at(-1)?.id !==
          requestId ||
        !['record', 'review', 'clarify'].includes(result.nextAction) ||
        !Number.isFinite(result.confidence) ||
        result.confidence < 0 ||
        result.confidence > 1
      )
        return;
      decision = freeze(copy(result));
      decisionRevision = application.revision;
      messages = [
        ...messages.filter((message) => message.id !== `decision-${requestId}`),
        {
          id: `decision-${requestId}`,
          role: 'assistant',
          content: json,
          decision,
        },
      ];
      record('decision', result);
    },
    applyDecision() {
      if (
        format !== 'decision' ||
        cursor !== null ||
        status !== 'complete' ||
        finishReason !== 'stop' ||
        appliedTurn === turn ||
        !decision ||
        decision.confidence < 0.75 ||
        decisionRevision !== application.revision
      )
        return false;
      application = freeze(
        copy({
          ...application,
          revision: application.revision + 1,
          nextAction: decision.nextAction,
        }),
      );
      appliedTurn = turn;
      record('choose', application);
      return true;
    },
    accept(proposal) {
      let localOriginal: WorkbenchFrame['props'] = null;
      if (options.localModel) {
        try {
          localOriginal = workbenchStructuredProps(JSON.parse(json));
        } catch {
          return false;
        }
        if (
          format !== 'structured' ||
          localModel?.state !== 'ready' ||
          !localSource ||
          uiRevision !== application.revision ||
          !isWorkbenchPlan(localOriginal) ||
          localOriginal.title !== props?.title ||
          localOriginal.steps.length !== props?.steps?.length ||
          localOriginal.steps.some(
            (step, index) => step !== props?.steps?.[index],
          )
        )
          return false;
      }
      const original = options.uiLesson
        ? decodeWorkbenchUiDocument(json, options.uiLesson)
        : null;
      if (
        (options.uiLesson &&
          (format !== 'ui' ||
            uiRevision !== application.revision ||
            !original ||
            original.component === 'PlanReading' ||
            original.component !== uiComponent ||
            original.props.title !== props?.title ||
            original.props.steps.length !== props?.steps?.length ||
            original.props.steps.some(
              (step, index) => step !== props?.steps?.[index],
            ))) ||
        cursor !== null ||
        status !== 'complete' ||
        finishReason !== 'stop' ||
        appliedTurn === turn ||
        !propsReady ||
        !isWorkbenchPlan(props) ||
        !isWorkbenchPlan(proposal) ||
        props.title !== proposal.title ||
        props.steps.length !== proposal.steps.length ||
        props.steps.some((step, index) => step !== proposal.steps[index])
      )
        return false;
      application = freeze(
        copy({
          revision: application.revision + 1,
          plan: { title: proposal.title, steps: [...proposal.steps] },
        }),
      );
      appliedTurn = turn;
      record('accept', application);
      return true;
    },
    seek(index) {
      if (
        status === 'loading' ||
        (format === 'history' &&
          (!!history?.replacement || isWorkbenchHistoryBusy(history?.sdk))) ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= events.length
      )
        return;
      localPreparationId = null;
      cursor = index;
      notify();
    },
    live() {
      cursor = null;
      notify();
    },
    clear() {
      generation++;
      localPreparationId = null;
      localModel = undefined;
      localSource = false;
      history = undefined;
      javascript = undefined;
      authoring = undefined;
      latestSentUserId = null;
      agent = undefined;
      replacementBaseline = '';
      replacementObservedBusy = false;
      historySuccess = false;
      workflow = undefined;
      resumeIntent = false;
      application = initialApplication();
      events = [];
      cursor = null;
      turn = 0;
      status = 'idle';
      messages = [];
      json = '';
      props = null;
      uiComponent = undefined;
      uiRevision = application.revision;
      decision = undefined;
      transformation = undefined;
      instructions = undefined;
      propsReady = false;
      finishReason = undefined;
      recipe = undefined;
      citation = undefined;
      dismissedPredictions = [];
      recipeRevision = -1;
      appliedTurn = -1;
      notify();
    },
  };
}
