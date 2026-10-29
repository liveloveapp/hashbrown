import { saveWorkbenchCapture } from './workbench-capture-file';
import { verifyWorkbenchKeyboard } from './verify-workbench-keyboard';
import { verifyLocalWorkbench } from './verify-local-workbench';
import { assertLocalRecordingAllowed } from './docs-local-models-fixtures';
import { verifyJavaScriptWorkbench } from './verify-javascript-workbench';
import {
  type UiFixtureOutcome,
  verifyUiWorkbench,
} from './verify-ui-workbench';
import {
  getWorkbenchUiFixtureLesson,
  workbenchUiFixtureText,
} from './workbench-ui-fixture';
import {
  type AgentFixtureOutcome,
  type AuthoringFixtureOutcome,
  verifyAuthoringWorkbench,
} from './verify-authoring-workbench';
import { workbenchAuthoringFixtureText } from './workbench-authoring-fixture';
import { createWorkbenchAgentStream } from '../../examples/quickstart/server/workbench-agent';
import { DecisionError } from '@hashbrownai/typesafe';
import { verifyServerWorkbench } from './verify-server-workbench';
import {
  createWorkbenchFallbackPreview,
  createWorkbenchPlanPreview,
  createWorkbenchPreview,
  workbenchVerificationTiming,
} from './workbench-verification-timing';
import { verifyHistoryWorkbench } from './verify-history-workbench';
import { workbenchHistoryFixtureText } from './workbench-history-fixture';
import { verifyWorkflowWorkbench } from './verify-workflow-workbench';
import { workbenchWorkflowFixtureText } from './workbench-workflow-fixture';
import { createWorkbenchWorkflowStream } from '../../examples/quickstart/server/workbench-workflows';
import { verifyOnboardingWorkbench } from './verify-onboarding-workbench';
import { workbenchOnboardingFixtureText } from './workbench-onboarding-fixture';
import type { WorkbenchInstructionsTrace } from '../../examples/quickstart/runtime/workbench-onboarding';
import { HashbrownTypeSafe } from '@hashbrownai/typesafe';
import { workbenchSelectionSchema } from '../../examples/quickstart/runtime/workbench-recipes';
import { type Decision } from '@hashbrownai/core';
import { workbenchDecisionSchema } from '../../examples/quickstart/runtime/workbench';
import { verifyDecisionWorkbench } from './verify-decision-workbench';
import { verifyRecipeWorkbench } from './verify-recipe-workbench';
import { verifyEmbedWorkbench } from './verify-embed-workbench';
import {
  expectNoHorizontalOverflow,
  expectWorkbenchDefaultLayout,
} from './verify-workbench-layout';
/** Verifies the checked framework hosts with deterministic HTTP events or a real provider. */
import { type AGUIEvent, EventType, type RunAgentInput } from '@ag-ui/core';
import { createWorkbenchOpenAIStream } from '../../examples/quickstart/server/workbench-openai';
import { createSupportProviderEvents } from './docs-request-transform-fixtures';
import type { WorkbenchTransformationTrace } from '../../examples/quickstart/runtime/workbench-transformation';
import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { hostedWorkbenchLessons as workbenchLessons } from '../../examples/quickstart/runtime/workbench-lessons';
import { createWorkbenchApp } from '../../examples/quickstart/server/workbench-app';

const live = process.env['WORKBENCH_LIVE'] === '1';
const recording = process.env['WORKBENCH_RECORD'] === '1';
const eventDelayMs = process.env['WORKBENCH_RECORD'] === '1' ? 20 : 0;
async function* pacedProvider(
  events: AsyncIterable<AGUIEvent>,
  signal: AbortSignal,
) {
  for await (const event of events) {
    if (eventDelayMs)
      await new Promise((resolve) => setTimeout(resolve, eventDelayMs));
    if (signal.aborted) return;
    yield event;
  }
}
let pendingPreview: ReturnType<typeof createWorkbenchPreview> | undefined;
let pendingPartial: ReturnType<typeof createWorkbenchPlanPreview> | undefined;
let pendingFallback:
  ReturnType<typeof createWorkbenchFallbackPreview> | undefined;
/** Holds incomplete UI-kit props until the browser sees the framework fallback. */
function holdFallback(): () => void {
  const preview = createWorkbenchFallbackPreview();
  pendingFallback = preview;
  return () => {
    preview.release();
    if (pendingFallback === preview) pendingFallback = undefined;
  };
}
/** Holds the first renderable plan fragment until its browser assertion completes. */
function holdPartial(completeFirstStep = false): () => void {
  const preview = createWorkbenchPlanPreview(completeFirstStep);
  pendingPartial = preview;
  return () => {
    preview.release();
    if (pendingPartial === preview) pendingPartial = undefined;
  };
}
/** Starts a single provisional-output checkpoint for the current serial scenario. */
function holdPreview(): () => void {
  const preview = createWorkbenchPreview();
  pendingPreview = preview;
  return () => {
    preview.release();
    if (pendingPreview === preview) pendingPreview = undefined;
  };
}
const requests: RunAgentInput[] = [];
const agentRequests: { state: string }[] = [];
let agentOutcome: AgentFixtureOutcome = 'success';
let authoringOutcome: AuthoringFixtureOutcome = 'success';
let uiOutcome: UiFixtureOutcome = 'success';
const workflowProviderRequests: RunAgentInput[] = [];
const transformations: WorkbenchTransformationTrace[] = [];
const instructions: WorkbenchInstructionsTrace[] = [];
const nativeRequests: Record<string, unknown>[] = [];
let fixtureBaseURL = '';
const decisionRequests: Decision.Request[] = [];
let decisionOutcome: 'success' | 'low' | 'error' | 'delay' | 'unknown' =
  'success';
const work = resolve(
  process.env['WORKBENCH_OUTPUT'] ?? 'dist/docs-workbench/verification',
);
mkdirSync(work, { recursive: true });
let recipeOutcome:
  | 'success'
  | 'empty'
  | 'wrong-context'
  | 'unknown'
  | 'duplicate'
  | 'error'
  | 'length'
  | 'schema' = 'success';
let outcome: 'success' | 'error' | 'length' | 'schema' | 'no-finish' =
  'success';
async function* fixture(
  input: RunAgentInput,
  signal: AbortSignal,
  lessonId?: string,
): AsyncGenerator<AGUIEvent> {
  const ids = { threadId: input.threadId, runId: input.runId };
  yield { type: EventType.RUN_STARTED, ...ids };
  const user = [...input.messages]
    .reverse()
    .find((message) => message.role === 'user');
  const offset = input.messages.findIndex((message) => message.id === user?.id);
  const onboardingText =
    workbenchWorkflowFixtureText(lessonId, input.messages) ??
    workbenchOnboardingFixtureText(lessonId, input.messages);
  if (onboardingText !== undefined) {
    const messageId = `${input.runId}-answer`;
    yield { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' };
    for (let index = 0; index < onboardingText.length; index += 10) {
      await new Promise((done) =>
        setTimeout(
          done,
          workbenchVerificationTiming(recording, lessonId).chunkMs,
        ),
      );
      if (signal.aborted) return;
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta: onboardingText.slice(index, index + 10),
      };
      await pendingPartial?.wait(
        onboardingText.slice(index, index + 10),
        signal,
      );
    }
    yield { type: EventType.TEXT_MESSAGE_END, messageId };
    await pendingPreview?.wait(signal);
    await new Promise((done) =>
      setTimeout(
        done,
        workbenchVerificationTiming(recording, lessonId).verdictMs,
      ),
    );
    yield outcome === 'error'
      ? { type: EventType.RUN_ERROR, message: 'Intentional test failure' }
      : {
          type: EventType.RUN_FINISHED,
          ...ids,
          metadata: {
            hashbrown: {
              finishReason: outcome === 'length' ? 'length' : 'stop',
            },
          },
        };
    return;
  }
  const predictions = lessonId === 'predictions';
  const text = lessonId === 'magic-text';
  const verdict = predictions || text ? recipeOutcome : outcome;
  if (
    !predictions &&
    !input.messages.slice(offset + 1).some((message) => message.role === 'tool')
  ) {
    const toolCallId = input.runId + '-context';
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId,
      toolCallName: 'readContext',
    };
    yield { type: EventType.TOOL_CALL_ARGS, toolCallId, delta: '{}' };
    yield { type: EventType.TOOL_CALL_END, toolCallId };
    yield {
      type: EventType.RUN_FINISHED,
      ...ids,
      metadata: { hashbrown: { finishReason: 'tool_calls' } },
    };
    return;
  }
  const second = String(user?.content).toLowerCase().includes('shorter');
  const messageId = `${input.runId}-answer`;
  const ui = {
    ui: [
      {
        SummaryCard: {
          props: {
            title: 'Show a trusted component',
            steps: [
              'Expose a SummaryCard',
              second
                ? 'Record a demo'
                : 'Record a short demo of the generated interface',
            ],
          },
        },
      },
    ],
  };
  const format = (input.forwardedProps as { hashbrown?: { ui?: boolean } })
    ?.hashbrown?.ui;
  const completionInput = predictions
    ? (JSON.parse(String(user?.content)) as {
        contextId: string;
        application: { acceptedActions: string[] };
      })
    : null;
  const afterRecord =
    completionInput?.application.acceptedActions.includes('record');
  const suggestions = afterRecord
    ? [
        {
          actionId: 'review',
          reason: 'Review the recorded demo before sharing it.',
        },
      ]
    : [{ actionId: 'record', reason: 'The outline is ready to record.' }];
  const valid = text
    ? second
      ? '## Your plan\n\n**Outline**, then record.[^1]\n\n- Outline the demo.\n- Record a demo.\n\n[^1]: https://hashbrown.dev'
      : '## Your two-step plan\n\nYour application owns this **trusted plan**. Follow its two clear steps, then capture a short demonstration of the generated interface.[^1]\n\n- Outline the trusted UI demo.\n- Record a short demo showing the generated interface.\n\n[^1]: https://hashbrown.dev'
    : predictions
      ? JSON.stringify({
          contextId:
            verdict === 'wrong-context'
              ? 'stale-context'
              : completionInput?.contextId,
          suggestions:
            verdict === 'empty'
              ? []
              : verdict === 'unknown'
                ? [{ actionId: 'delete', reason: 'Unknown action' }]
                : verdict === 'duplicate'
                  ? [suggestions[0], suggestions[0]]
                  : suggestions,
        })
      : JSON.stringify(format ? ui : ui.ui[0].SummaryCard.props);
  const json =
    verdict === 'schema'
      ? predictions || text
        ? valid.slice(0, -8)
        : `${valid.slice(0, -2)},{"SummaryCard":,}]}`
      : valid;
  yield { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' };
  for (let index = 0; index < json.length; index += 14) {
    await new Promise((done) =>
      setTimeout(
        done,
        workbenchVerificationTiming(recording, lessonId).chunkMs,
      ),
    );
    if (signal.aborted) return;
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta: json.slice(index, index + 14),
    };
  }
  yield { type: EventType.TEXT_MESSAGE_END, messageId };
  // The browser releases the first preview after asserting its disabled action.
  await pendingPreview?.wait(signal);
  // Leave a visible complete-looking preview before the terminal verdict.
  await new Promise((done) =>
    setTimeout(
      done,
      workbenchVerificationTiming(recording, lessonId).verdictMs,
    ),
  );
  yield verdict === 'error'
    ? { type: EventType.RUN_ERROR, message: 'Intentional test failure' }
    : {
        type: EventType.RUN_FINISHED,
        ...ids,
        metadata: {
          hashbrown: { finishReason: verdict === 'length' ? 'length' : 'stop' },
        },
      };
}
const apiKey = process.env['OPENAI_API_KEY'];
const model = process.env['OPENAI_MODEL'];
if (
  live &&
  !['javascript-runtime', 'local-models'].includes(
    process.env['WORKBENCH_LESSONS'] ?? '',
  ) &&
  (!apiKey || !model)
)
  throw new Error(
    'Live verification requires OPENAI_API_KEY and OPENAI_MODEL.',
  );
const workflowStream = createWorkbenchWorkflowStream({
  delegate: (input, signal, lesson) => {
    workflowProviderRequests.push(structuredClone(input));
    return live
      ? createWorkbenchOpenAIStream({
          apiKey: apiKey as string,
          model: model as string,
        })(input, signal, lesson)
      : fixture(input, signal, lesson);
  },
});
const agentStream = createWorkbenchAgentStream({
  delegate: fixture,
  classify: async ({ request, schema, signal }) => {
    agentRequests.push(structuredClone(request));
    if (live) {
      const apiKey = process.env['TYPESAFE_API_KEY'],
        model = process.env['TYPESAFE_MODEL'];
      if (!apiKey || !model)
        throw new Error(
          'Live agent decisions require server-only TypeSafe configuration',
        );
      return HashbrownTypeSafe.decide({
        apiKey,
        model,
        request,
        schema,
        signal,
        maxRequestChars: 16000,
      });
    }
    if (agentOutcome === 'delay') await new Promise((r) => setTimeout(r, 700));
    if (agentOutcome === 'unavailable')
      throw new DecisionError(
        'upstream',
        503,
        'Fixture classifier unavailable',
      );
    if (agentOutcome === 'error')
      throw new Error('Intentional classifier programming failure');
    const route =
      agentOutcome === 'invalid'
        ? 'unknown'
        : request.state.toLowerCase().includes('record')
          ? 'record'
          : 'outline';
    const confidence = agentOutcome === 'low' ? 0.4 : 0.97;
    return {
      kind: 'hashbrown.decision',
      version: 1,
      value: { route },
      meta: { route: { confidence, probabilities: { [route]: confidence } } },
    };
  },
});
const app = createWorkbenchApp({
  decide: async (request, signal, lessonId): Promise<Decision.Response> => {
    decisionRequests.push(structuredClone(request));
    if (live) {
      const key = process.env['TYPESAFE_API_KEY'],
        model = process.env['TYPESAFE_MODEL'];
      if (!key || !model)
        throw new Error(
          'Live decisions require TYPESAFE_API_KEY and TYPESAFE_MODEL',
        );
      return HashbrownTypeSafe.decide({
        apiKey: key,
        model,
        request,
        schema:
          lessonId === 'ui-selection'
            ? workbenchSelectionSchema
            : workbenchDecisionSchema,
        signal,
        maxRequestChars: 16000,
      });
    }
    const mode = decisionOutcome;
    if (mode === 'delay')
      await new Promise((resolve) => setTimeout(resolve, 600));
    if (mode === 'error') throw new Error('Intentional decision failure');
    const input = (request.state as { input: { prompt: string } }).input;
    if (lessonId === 'ui-selection') {
      const pick =
        mode === 'unknown'
          ? 'unknown'
          : input.prompt.toLowerCase().includes('ordered')
            ? 'steps'
            : 'summary';
      const confidence = mode === 'low' ? 0.4 : 0.97;
      return {
        kind: 'hashbrown.decision',
        version: 1,
        value: { pick },
        meta: {
          pick: {
            confidence,
            probabilities: {
              summary: pick === 'summary' ? confidence : 1 - confidence,
              steps: pick === 'steps' ? confidence : 1 - confidence,
            },
          },
        },
      };
    }
    const choice = input.prompt.toLowerCase().includes('recorded')
      ? 'review'
      : 'record';
    const confidence = mode === 'low' ? 0.4 : 0.97;
    return {
      kind: 'hashbrown.decision',
      version: 1,
      value: { nextAction: choice },
      meta: {
        nextAction: {
          confidence,
          probabilities:
            choice === 'record'
              ? {
                  record: confidence,
                  review: (1 - confidence) / 2,
                  clarify: (1 - confidence) / 2,
                }
              : {
                  record: (1 - confidence) / 2,
                  review: confidence,
                  clarify: (1 - confidence) / 2,
                },
        },
      },
    };
  },
  staticDirectory: resolve('dist/docs-workbench/browser'),
  source: live ? 'provider' : 'test-fixture',
  stream: (input, signal, lessonId) => {
    requests.push(structuredClone(input));
    const events =
      lessonId === 'agent-decisions'
        ? agentStream(input, signal, lessonId)
        : ['shared-state', 'activities', 'interrupts'].includes(lessonId ?? '')
          ? workflowStream(input, signal, lessonId)
          : live ||
              lessonId === 'request-transformation' ||
              lessonId === 'system-instructions' ||
              lessonId === 'message-history' ||
              lessonId === 'save-text-conversations' ||
              lessonId === 'server-threads' ||
              lessonId === 'public-endpoint' ||
              lessonId === 'json-parser' ||
              lessonId === 'natural-forms' ||
              lessonId === 'ui-kits' ||
              lessonId === 'ui-chatbot'
            ? createWorkbenchOpenAIStream({
                apiKey: live ? (apiKey as string) : 'fixture-only',
                model: live ? (model as string) : 'fixture-model',
                ...(live ? {} : { baseURL: fixtureBaseURL }),
              })(input, signal, lessonId)
            : fixture(input, signal, lessonId);
    return (async function* () {
      for await (const event of pacedProvider(events, signal)) {
        if (
          event.type === EventType.CUSTOM &&
          event.name === 'workbench.request-transformation'
        )
          transformations.push(structuredClone(event.value));
        if (
          event.type === EventType.CUSTOM &&
          event.name === 'workbench.system-instructions'
        )
          instructions.push(structuredClone(event.value));
        yield event;
      }
    })();
  },
});
// This explicitly labelled provider-native fixture exercises the same adapter callback as live runs.
app.post('/fixture-openai/v1/responses', async (req, res) => {
  const mapped = req.body as Record<string, unknown>;
  nativeRequests.push(structuredClone(mapped));
  const input = mapped['input'] as {
    type?: string;
    role?: string;
    content?: unknown;
  }[];
  const userIndex = input.map((item) => item.role).lastIndexOf('user');
  const hasContext = input
    .slice(userIndex + 1)
    .some((item) => item.type === 'function_call_output');
  const second = JSON.stringify(input[userIndex]?.content)
    .toLowerCase()
    .includes('shorter');
  const call = {
    type: 'function_call',
    id: `fc-${nativeRequests.length}`,
    call_id: `call-${nativeRequests.length}`,
    name: 'readContext',
    arguments: '{}',
  };
  const json = JSON.stringify({
    ui: [
      {
        SummaryCard: {
          props: {
            title: 'Show a trusted component',
            steps: [
              'Expose a SummaryCard',
              second
                ? 'Record a demo'
                : 'Record a short demo of the generated interface',
            ],
          },
        },
      },
    ],
  });
  const onboarding =
    mapped['tools'] === undefined ||
    (Array.isArray(mapped['tools']) && mapped['tools'].length === 0);
  const authoringLesson = JSON.stringify(mapped).includes(
    'The user separately reviews, edits and applies',
  )
    ? 'natural-forms'
    : JSON.stringify(mapped).includes(
          'Return only a JSON object with title and steps',
        )
      ? 'json-parser'
      : undefined;
  let authoringText = workbenchAuthoringFixtureText(authoringLesson, input);
  if (authoringText) {
    if (authoringOutcome === 'malformed') authoringText += ' trailing';
    if (authoringOutcome === 'missing')
      authoringText = '{"title":"Missing steps"}';
    if (authoringOutcome === 'wrong-type')
      authoringText = '{"title":"Wrong type","steps":["Outline",42]}';
    if (authoringOutcome === 'truncated')
      authoringText = authoringText.slice(0, -8);
  }
  const uiLesson = getWorkbenchUiFixtureLesson(input);
  let uiText = workbenchUiFixtureText(uiLesson, input);
  if (uiText) {
    if (uiOutcome === 'unknown')
      uiText = uiText.replace(
        /SummaryCard|StepsCard|PlanReading/g,
        'UntrustedCard',
      );
    if (uiOutcome === 'multiple') {
      const value = JSON.parse(uiText);
      value.ui = [...value.ui, ...value.ui];
      uiText = JSON.stringify(value);
    }
    if (uiOutcome === 'malformed') uiText += ' trailing';
    if (uiOutcome === 'truncated') uiText = uiText.slice(0, -8);
  }
  const onboardingText = uiLesson
    ? hasContext
      ? uiText
      : undefined
    : authoringLesson
      ? authoringLesson === 'json-parser' || hasContext
        ? authoringText
        : undefined
      : onboarding
        ? (workbenchHistoryFixtureText(
            JSON.stringify(mapped).includes('Remember the plan name supplied')
              ? 'message-history'
              : undefined,
            input,
          ) ?? workbenchOnboardingFixtureText('system-instructions', input))
        : undefined;
  const events =
    onboardingText !== undefined
      ? createSupportProviderEvents(onboardingText).map((event) =>
          event.type === 'response.completed' &&
          (outcome === 'error' ||
            outcome === 'length' ||
            (authoringLesson &&
              (authoringOutcome === 'error' ||
                authoringOutcome === 'length')) ||
            (uiLesson && (uiOutcome === 'error' || uiOutcome === 'length')))
            ? {
                type:
                  outcome === 'error' ||
                  authoringOutcome === 'error' ||
                  uiOutcome === 'error'
                    ? 'response.failed'
                    : 'response.incomplete',
                response: {
                  status:
                    outcome === 'error' ||
                    authoringOutcome === 'error' ||
                    uiOutcome === 'error'
                      ? 'failed'
                      : 'incomplete',
                  error: { message: 'Intentional test failure' },
                  incomplete_details: { reason: 'max_output_tokens' },
                  output: [],
                },
              }
            : event,
        )
      : hasContext
        ? createSupportProviderEvents(json)
        : [
            {
              type: 'response.output_item.added',
              output_index: 0,
              item: { ...call, arguments: '' },
            },
            { type: 'response.output_item.done', output_index: 0, item: call },
            {
              type: 'response.completed',
              response: { status: 'completed', output: [] },
            },
          ];
  if (uiLesson && uiOutcome === 'delay')
    await new Promise((done) => setTimeout(done, 700));
  if (res.destroyed) return;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
  });
  for (const [sequence_number, event] of events.entries()) {
    if ((hasContext || onboarding) && event.type === 'response.completed')
      await pendingPreview?.wait(new AbortController().signal);
    if (outcome === 'no-finish' && event.type === 'response.completed')
      continue;
    if (res.destroyed) return;
    res.write(
      `event: ${event.type}\ndata: ${JSON.stringify({ ...event, sequence_number })}\n\n`,
    );
    if (event.type === 'response.output_text.delta' && 'delta' in event) {
      await pendingFallback?.wait(
        String(event.delta),
        new AbortController().signal,
      );
      await pendingPartial?.wait(
        String(event.delta),
        new AbortController().signal,
      );
    }
    if (event.type === 'response.output_text.delta')
      await new Promise((done) =>
        setTimeout(done, workbenchVerificationTiming(recording).chunkMs),
      );
  }
  if (hasContext)
    await new Promise((done) =>
      setTimeout(done, workbenchVerificationTiming(recording).verdictMs),
    );
  res.end();
});
const server = createServer(app);
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
if (!address || typeof address === 'string')
  throw new Error('Missing verification port');
fixtureBaseURL = `http://127.0.0.1:${address.port}/fixture-openai/v1`;
const browser = await chromium.launch({ headless: true }).catch((error) => {
  if (process.env['CI']) throw error;
  return chromium.launch({ headless: true, channel: 'chrome' });
});
const requestedLessons = process.env['WORKBENCH_LESSONS']
  ? process.env['WORKBENCH_LESSONS'].split(',')
  : undefined;
if (
  requestedLessons?.some(
    (id) => !workbenchLessons.some((lesson) => lesson.id === id),
  )
)
  throw new Error('Unknown WORKBENCH_LESSONS value');
const lessons = workbenchLessons.filter(
  (lesson) => !requestedLessons || requestedLessons.includes(lesson.id),
);
const report: unknown[] = [];
let nativeLocal: import('@playwright/test').BrowserContext | undefined;
if (live && lessons.some((lesson) => lesson.id === 'local-models')) {
  assertLocalRecordingAllowed(process.env['CI']);
  const launch = {
    launchOptions: {
      args: [
        '--disable-features=',
        '--enable-features=AIPromptAPIToolUse,OnDeviceModelConversationBackend,AIApiFoundationalModel:model_version/v4',
      ],
      ignoreDefaultArgs: [
        '--disable-component-update',
        '--disable-background-networking',
        '--disable-field-trial-config',
      ],
    },
  };
  nativeLocal = await chromium.launchPersistentContext(
    process.env['LOCAL_MODEL_PROFILE'] ??
      '/tmp/hashbrown-native-tools-model-profile',
    {
      ...launch.launchOptions,
      channel: 'chrome',
      headless: false,
      viewport: { width: 1600, height: 1000 },
      ...(process.env['WORKBENCH_RECORD'] === '1'
        ? { recordVideo: { dir: work, size: { width: 1600, height: 1000 } } }
        : {}),
    },
  );
}

/** Retains completed-path evidence separately from the publication-gating final report. */
function saveCheckpoint(complete = false) {
  writeFileSync(
    resolve(work, 'checkpoint-report.json'),
    JSON.stringify({ complete, results: report }, null, 2),
  );
}
try {
  for (const lesson of lessons) {
    for (const framework of ['react', 'angular']) {
      if (lesson.id === 'local-models') {
        report.push(
          await verifyLocalWorkbench({
            browser,
            native: nativeLocal,
            framework,
            origin: `http://127.0.0.1:${address.port}`,
            work,
            live,
            recording: process.env['WORKBENCH_RECORD'] === '1',
          }),
        );
        saveCheckpoint();
        continue;
      }
      if (lesson.id === 'javascript-runtime') {
        report.push(
          await verifyJavaScriptWorkbench({
            browser,
            framework,
            origin: `http://127.0.0.1:${address.port}`,
            work,
            live,
            recording: process.env['WORKBENCH_RECORD'] === '1',
          }),
        );
        saveCheckpoint();
        continue;
      }
      if (lesson.id === 'ui-kits' || lesson.id === 'ui-chatbot') {
        report.push(
          await verifyUiWorkbench({
            browser,
            framework,
            lesson: lesson.id,
            origin: `http://127.0.0.1:${address.port}`,
            work,
            live,
            recording: process.env['WORKBENCH_RECORD'] === '1',
            fallback: holdFallback,
            partial: () => holdPartial(true),
            requests,
            nativeRequests,
            outcome: (value) => {
              uiOutcome = value;
            },
          }),
        );
        saveCheckpoint();
        continue;
      }
      if (
        lesson.id === 'agent-decisions' ||
        lesson.id === 'json-parser' ||
        lesson.id === 'natural-forms'
      ) {
        report.push(
          await verifyAuthoringWorkbench({
            browser,
            framework,
            lesson: lesson.id,
            origin: `http://127.0.0.1:${address.port}`,
            work,
            live,
            recording: process.env['WORKBENCH_RECORD'] === '1',
            preview: holdPreview,
            requests,
            agentRequests,
            authoringOutcome: (value) => {
              authoringOutcome = value;
            },
            agentOutcome: (value) => {
              agentOutcome = value;
            },
          }),
        );
        saveCheckpoint();
        continue;
      }
      if (lesson.id === 'server-threads' || lesson.id === 'public-endpoint') {
        report.push(
          await verifyServerWorkbench({
            browser,
            framework,
            lesson: lesson.id,
            origin: `http://127.0.0.1:${address.port}`,
            work,
            live,
            recording: process.env['WORKBENCH_RECORD'] === '1',
            requests,
          }),
        );
        saveCheckpoint();
        continue;
      }
      if (
        lesson.id === 'message-history' ||
        lesson.id === 'save-text-conversations'
      ) {
        report.push(
          await verifyHistoryWorkbench({
            browser,
            framework,
            lesson: lesson.id,
            origin: `http://127.0.0.1:${address.port}`,
            work,
            live,
            recording: process.env['WORKBENCH_RECORD'] === '1',
            preview: holdPreview,
            requests,
            nativeRequests,
            outcome: (value) => {
              outcome = value;
            },
          }),
        );
        saveCheckpoint();
        continue;
      }
      if (['shared-state', 'activities', 'interrupts'].includes(lesson.id)) {
        report.push(
          await verifyWorkflowWorkbench({
            providerRequests: workflowProviderRequests,
            browser,
            framework,
            lesson: lesson.id as 'shared-state' | 'activities' | 'interrupts',
            origin: `http://127.0.0.1:${address.port}`,
            work,
            live,
            recording: process.env['WORKBENCH_RECORD'] === '1',
            preview: holdPreview,
            requests,
            outcome: (value) => {
              outcome = value;
            },
          }),
        );
        saveCheckpoint();
        continue;
      }
      if (
        ['first-plan', 'conversation', 'system-instructions'].includes(
          lesson.id,
        )
      ) {
        report.push(
          await verifyOnboardingWorkbench({
            browser,
            framework,
            lesson: lesson.id as
              'first-plan' | 'conversation' | 'system-instructions',
            origin: `http://127.0.0.1:${address.port}`,
            work,
            live,
            recording: process.env['WORKBENCH_RECORD'] === '1',
            preview: holdPreview,
            partial: holdPartial,
            requests,
            instructions,
            nativeRequests,
            outcome: (value) => {
              outcome = value;
            },
          }),
        );
        saveCheckpoint();
        continue;
      }
      if (['magic-text', 'predictions', 'ui-selection'].includes(lesson.id)) {
        report.push(
          await verifyRecipeWorkbench({
            browser,
            framework,
            lesson: lesson.id as 'magic-text' | 'predictions' | 'ui-selection',
            origin: `http://127.0.0.1:${address.port}`,
            work,
            live,
            recording: process.env['WORKBENCH_RECORD'] === '1',
            preview: holdPreview,
            requests,
            decisionRequests,
            outcome: (value) => {
              recipeOutcome = value;
            },
            decisionOutcome: (value) => {
              decisionOutcome = value;
            },
          }),
        );
        saveCheckpoint();
        continue;
      }
      if (lesson.format === 'decision') {
        report.push(
          await verifyDecisionWorkbench({
            browser,
            framework,
            origin: `http://127.0.0.1:${address.port}`,
            work,
            live,
            recording: process.env['WORKBENCH_RECORD'] === '1',
            requests: decisionRequests,
            outcome: (value) => {
              decisionOutcome = value;
            },
          }),
        );
        saveCheckpoint();
        continue;
      }
      console.log(
        `Verifying ${framework}/${lesson.id} (${live ? 'provider' : 'test-fixture'})`,
      );
      const errors: string[] = [];
      const page = await browser.newPage({
        viewport: { width: 1600, height: 1000 },
        ...(process.env['WORKBENCH_RECORD'] === '1'
          ? { recordVideo: { dir: work, size: { width: 1600, height: 1000 } } }
          : {}),
      });
      const captureStarted = Date.now();
      const phases: Record<string, number> = {};
      const mark = (name: string) => {
        phases[name] = (Date.now() - captureStarted) / 1000;
      };
      page.on('pageerror', (error) => {
        errors.push(error.message);
        console.log(`${framework} browser error: ${error.message}`);
      });
      page.on('console', (message) => {
        if (message.type() === 'error')
          console.log(`${framework} console: ${message.text()}`);
      });
      const previewTitles: string[] = [];
      if (lesson.id === 'streaming') {
        await page.exposeFunction(
          '__captureStreamingPreview',
          (title: string) => {
            if (!previewTitles.includes(title)) previewTitles.push(title);
          },
        );
      }
      const start = requests.length;
      const transformationStart = transformations.length;
      const nativeStart = nativeRequests.length;
      let browserRequests = 0;
      const statuses: number[] = [];
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/api/workbench/'))
          browserRequests++;
      });
      page.on('response', (response) => {
        if (new URL(response.url()).pathname.startsWith('/api/workbench/'))
          statuses.push(response.status());
      });
      await page.goto(
        `http://127.0.0.1:${address.port}/${framework}.html?lesson=${lesson.id}`,
      );
      const send = page.locator('.wb:visible [data-send]');
      const newConversation = async () => {
        const selected = page.locator(
          '.wb:visible .wb-nav [aria-pressed=true]',
        );
        const before = await selected.innerText();
        await page
          .getByRole('button', { name: 'New conversation', exact: true })
          .click();
        try {
          await expect(selected).not.toHaveText(before);
        } catch (error) {
          await page.screenshot({
            path: resolve(
              work,
              `${framework}-${lesson.id}-navigation-failure.png`,
            ),
            fullPage: true,
            animations: 'disabled',
          });
          console.log('Navigation errors:', JSON.stringify(errors));
          throw error;
        }
        if (lesson.id === 'debugging')
          await page
            .getByRole('checkbox', { name: 'Demo denial', exact: true })
            .uncheck();
      };
      await expect(send).toBeVisible();
      if (lesson.id === 'streaming') {
        await page.evaluate(() => {
          const record = (
            window as unknown as {
              __captureStreamingPreview: (title: string) => void;
            }
          ).__captureStreamingPreview;
          new MutationObserver(() => {
            const cards = document.querySelectorAll(
              'article[aria-label="Summary card"]',
            );
            const card = cards[cards.length - 1];
            const title = card?.querySelector('h2')?.textContent;
            if (
              title &&
              title !== 'Building your plan…' &&
              card?.querySelector<HTMLButtonElement>('button')?.disabled
            )
              record(title);
          }).observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
          });
        });
      }

      await expect(page.locator('.wb:visible .wb-inspector')).toBeVisible();
      if (lesson.inspector !== 'Requests')
        await expect(
          page.locator('.wb:visible .wb-inspector [data-detail]'),
        ).toBeVisible();
      await expectWorkbenchDefaultLayout(page);
      await expect(
        page.getByRole('tab', { name: lesson.inspector, exact: true }),
      ).toHaveAttribute('aria-selected', 'true');
      if (lesson.id === 'generative-ui')
        await page.getByRole('tab', { name: 'JSON', exact: true }).click();
      if (process.env['WORKBENCH_RECORD'] === '1')
        await page.waitForTimeout(800);
      if (recording) await page.waitForTimeout(100);
      expect(requests).toHaveLength(start);
      expect(browserRequests).toBe(0);
      if (lesson.id === 'debugging') {
        const gate = page.getByRole('checkbox', {
          name: 'Demo denial',
          exact: true,
        });
        await expect(gate).toBeChecked();
        await send.click();
        await expect(
          page.locator('.wb:visible .wb-chat .wb-panel-head'),
        ).toContainText('error');
        await expect(page.locator('.wb:visible [data-source]')).toHaveText(
          'Local demo failure',
        );
        await expect(
          page.locator('.wb:visible .wb-inspector .wb-inspection'),
        ).toContainText('403');
        await expect(
          page.locator('.wb:visible .wb-inspector [data-detail]'),
        ).toContainText('Demo denial is enabled');
        expect(requests).toHaveLength(start);
        expect(browserRequests).toBe(1);
        expect(statuses).toEqual([403]);
        mark('denied');
        if (process.env['WORKBENCH_RECORD'] === '1')
          await page.waitForTimeout(900);
        await expect(
          page.locator('.wb:visible .wb-summary button:enabled'),
        ).toHaveCount(0);
        await page.getByRole('tab', { name: 'State', exact: true }).click();
        await expect(
          page.locator('.wb:visible .wb-inspector .wb-inspection'),
        ).toContainText('"revision": 0');
        await gate.uncheck();
        await page
          .getByRole('button', { name: 'First prompt', exact: true })
          .click();
        await expect(send).toBeEnabled();
        await page.getByRole('tab', { name: 'Requests', exact: true }).click();
        mark('recovery');
        if (process.env['WORKBENCH_RECORD'] === '1')
          await page.waitForTimeout(500);
      }
      mark('firstRequest');
      if (!live) pendingPreview = createWorkbenchPreview();
      await send.click();
      const card = page.getByRole('article', { name: 'Summary card' }).last();
      await expect(card).toBeVisible({ timeout: 60_000 });
      const accept = card.getByRole('button', {
        name: 'Accept plan',
        exact: true,
      });
      if (!live) await expect(accept).toBeDisabled();
      if (lesson.id === 'streaming' && !live)
        await expect(card.locator('h2')).not.toHaveText('Building your plan…');
      pendingPreview?.release();
      pendingPreview = undefined;
      await expect(accept)
        .toBeEnabled({ timeout: 15_000 })
        .catch(async (error) => {
          console.log('Failure UI:', await page.locator('body').innerText());
          throw error;
        });
      await expect(page.locator('.wb:visible [data-source]')).toHaveText(
        live ? 'Live model' : 'Test fixture',
      );
      if (lesson.id === 'streaming') {
        const title = await card.locator('h2').innerText();
        expect(
          previewTitles.some(
            (partial) =>
              partial.length < title.length && title.startsWith(partial),
          ),
        ).toBe(true);
      }
      const firstSteps = await card.locator('li').allTextContents();
      expect(firstSteps).toHaveLength(2);
      mark('firstComplete');
      // A verification step, not footage: recordings skip it.
      if (lesson.id === 'tools' && process.env['WORKBENCH_RECORD'] !== '1') {
        await verifyWorkbenchKeyboard(page, () => requests.length);
      }
      if (
        lesson.id === 'request-transformation' &&
        process.env['WORKBENCH_RECORD'] === '1'
      )
        await page.waitForTimeout(700);
      await page.getByRole('tab', { name: 'State', exact: true }).click();
      await expect(
        page.locator('.wb:visible .wb-inspector .wb-inspection'),
      ).toContainText('"revision": 0');
      if (process.env['WORKBENCH_RECORD'] === '1')
        await page.waitForTimeout(900);
      mark('accept');
      await accept.click();
      await expect(
        page.locator('.wb:visible .wb-inspector .wb-inspection'),
      ).toContainText('"revision": 1');
      if (process.env['WORKBENCH_RECORD'] === '1')
        await page.waitForTimeout(900);
      await page
        .getByRole('tab', {
          name:
            lesson.id === 'schemas'
              ? 'Schema'
              : lesson.id === 'tools' || lesson.id === 'debugging'
                ? 'Requests'
                : lesson.id === 'request-transformation'
                  ? 'Transform'
                  : 'JSON',
          exact: true,
        })
        .click();
      await page
        .getByRole('button', { name: 'Follow-up', exact: true })
        .click();
      mark('followup');
      await send.click();
      await expect(
        page.getByRole('article', { name: 'Summary card' }),
      ).toHaveCount(2, { timeout: 60_000 });
      await expect(
        page
          .getByRole('article', { name: 'Summary card' })
          .last()
          .getByRole('button', { name: 'Accept plan', exact: true }),
      ).toBeEnabled({ timeout: 60_000 });
      if (process.env['WORKBENCH_RECORD'] === '1')
        await page.waitForTimeout(900);
      await page.getByRole('tab', { name: 'State', exact: true }).click();
      const revisedSteps = await page
        .getByRole('article', { name: 'Summary card' })
        .last()
        .locator('li')
        .allTextContents();
      expect(revisedSteps).toHaveLength(2);
      expect(revisedSteps[0]).toBe(firstSteps[0]);
      expect(revisedSteps[1].length).toBeLessThan(firstSteps[1].length);
      mark('secondComplete');
      if (lesson.id === 'request-transformation') {
        await page.getByRole('tab', { name: 'Transform', exact: true }).click();
        const observed = JSON.parse(
          await page
            .locator('.wb:visible .wb-inspector .wb-inspection pre')
            .innerText(),
        ) as {
          before: WorkbenchTransformationTrace['before'];
          after: WorkbenchTransformationTrace['after'] & {
            addedInstructions?: string;
          };
        };
        const trace = transformations.at(-1);
        expect(trace).toBeDefined();
        expect(observed.before.model).toBe(trace?.before.model);
        expect(observed.after.model).toBe(trace?.after.model);
        expect(observed.after.model).toBe(live ? model : 'fixture-model');
        expect(observed.after.addedInstructions).toContain(
          'Workspace canonical-docs',
        );
        expect(trace?.before.instructions ?? '').not.toContain(
          'Workspace canonical-docs',
        );
        expect(observed.after.toolNames).toContain('readContext');
        expect(observed.after.responseFormat).toEqual(
          observed.before.responseFormat,
        );
        expect(observed.after.maxOutputTokens).toBe(2048);
        expect(Object.values(trace?.preserved ?? {}).every(Boolean)).toBe(true);
        expect(trace?.preserved['input']).toBe(true);
        expect(
          transformations.length - transformationStart,
        ).toBeGreaterThanOrEqual(4);
        if (!live) {
          const native = nativeRequests.slice(nativeStart);
          expect(native).toHaveLength(4);
          native.forEach((mapped, index) => {
            const observed = transformations[transformationStart + index].after;
            expect(observed.instructions).toBe(mapped['instructions']);
            expect(observed.model).toBe(mapped['model']);
            expect(observed.responseFormat).toEqual(
              (mapped['text'] as { format: unknown }).format,
            );
          });
        }
        await page.getByRole('tab', { name: 'State', exact: true }).click();
      }
      const captured = requests.slice(start);
      expect(captured.length).toBeGreaterThanOrEqual(4);
      if (!live) expect(captured).toHaveLength(4);
      const tool = [...captured[captured.length - 1].messages]
        .reverse()
        .find((message) => message.role === 'tool');
      expect(tool?.content).toContain('"revision":1');
      const grouped = new Map<string, RunAgentInput[]>();
      for (const request of captured) {
        const id = [...request.messages]
          .reverse()
          .find((message) => message.role === 'user')?.id;
        if (!id) throw new Error('Missing user origin');
        grouped.set(id, [...(grouped.get(id) ?? []), request]);
      }
      expect(grouped.size).toBe(2);
      [...grouped.values()].forEach((turn, index) => {
        const final = turn.at(-1);
        if (!final) throw new Error('Missing turn request');
        const userIndex = final.messages
          .map((message) => message.role)
          .lastIndexOf('user');
        const results = final.messages
          .slice(userIndex + 1)
          .filter((message) => message.role === 'tool');
        expect(results).toHaveLength(1);
        expect(JSON.parse(String(results[0].content)).revision).toBe(index);
      });
      const count = requests.length;
      const httpCount = browserRequests;
      mark('replay');
      if (process.env['WORKBENCH_RECORD'] === '1')
        await page.getByRole('tab', { name: 'JSON', exact: true }).click();
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await expect(page.locator('[data-replay]')).toBeVisible();
      await expect(send).toBeDisabled();
      if (process.env['WORKBENCH_RECORD'] === '1')
        await page.waitForTimeout(2200);
      const pause = page.getByRole('button', { name: 'Pause', exact: true });
      if (await pause.count()) await pause.click();
      await page
        .getByRole('button', { name: /^Parsed output[.]/ })
        .first()
        .press('Enter');
      await expect(page.locator('[data-replay] .wb-summary')).toHaveCount(1);
      if (process.env['WORKBENCH_RECORD'] === '1')
        await page.waitForTimeout(600);
      await page.getByRole('tab', { name: 'State', exact: true }).click();
      await page
        .getByRole('button', { name: /^Plan accepted[.]/ })
        .first()
        .press('Enter');
      await expect(
        page.locator('.wb:visible .wb-inspector .wb-inspection'),
      ).toContainText('"revision": 1');
      if (process.env['WORKBENCH_RECORD'] === '1')
        await page.waitForTimeout(700);
      const slider = page.getByRole('slider', { name: 'Seek captured event' });
      if (lesson.id === 'debugging') {
        await page.getByRole('button', { name: /^HTTP 403[.]/ }).press('Enter');
        await expect(page.locator('.wb:visible [data-source]')).toHaveText(
          'Local demo failure',
        );
        await expect(
          page.getByRole('checkbox', { name: 'Demo denial', exact: true }),
        ).toBeDisabled();
        await page.getByRole('tab', { name: 'Requests', exact: true }).click();
        await expect(
          page.locator('.wb:visible .wb-inspector .wb-inspection'),
        ).toContainText('403');
        if (process.env['WORKBENCH_RECORD'] === '1')
          await page.waitForTimeout(700);
        await page.getByRole('tab', { name: 'State', exact: true }).click();
      }
      if (lesson.id === 'request-transformation') {
        await page
          .getByRole('button', { name: /^Request transformed[.]/ })
          .first()
          .press('Enter');
        await page.getByRole('tab', { name: 'Transform', exact: true }).click();
        await expect(
          page.locator('.wb:visible .wb-inspector .wb-inspection'),
        ).toContainText('Workspace canonical-docs');
        if (process.env['WORKBENCH_RECORD'] === '1')
          await page.waitForTimeout(700);
        await page.getByRole('tab', { name: 'State', exact: true }).click();
      }
      await slider.fill('0');
      await expect(
        page.locator('.wb:visible .wb-inspector .wb-inspection'),
      ).toContainText('"revision": 0');
      await expect(page.locator('[data-replay]')).not.toContainText(
        'Record a demo',
      );
      await page
        .getByRole('button', { name: 'Return to live', exact: true })
        .click();
      await expect(
        page.locator('.wb:visible .wb-inspector .wb-inspection'),
      ).toContainText('"revision": 1');
      expect(requests).toHaveLength(count);
      expect(browserRequests).toBe(httpCount);
      const replayRequests = browserRequests - httpCount;
      await expect(page.locator('.wb:visible [data-source]')).toHaveText(
        live ? 'Live model' : 'Test fixture',
      );
      mark('returnedLive');
      if (process.env['WORKBENCH_RECORD'] !== '1') {
        await newConversation();
        await expect(
          page.getByRole('article', { name: 'Summary card' }),
        ).toHaveCount(0);
        await page
          .getByRole('button', { name: 'Two-step plan', exact: true })
          .click();
        await expect(
          page.getByRole('article', { name: 'Summary card' }),
        ).toHaveCount(2);
        await expect(
          page.locator('.wb:visible .wb-inspector .wb-inspection'),
        ).toContainText('"revision": 1');
        expect(requests).toHaveLength(count);
      }
      await page
        .getByRole('tab', {
          name:
            lesson.id === 'schemas'
              ? 'Schema'
              : lesson.id === 'tools' || lesson.id === 'debugging'
                ? 'Requests'
                : lesson.id === 'request-transformation'
                  ? 'Transform'
                  : 'JSON',
          exact: true,
        })
        .click();
      await page.screenshot({
        path: resolve(
          work,
          `${framework}-${lesson.id}-${live ? 'live' : 'fixture'}.png`,
        ),
        fullPage: true,
        animations: 'disabled',
      });
      if (!live && lesson.id !== 'request-transformation') {
        for (const failed of lesson.format === 'ui'
          ? (['error', 'length', 'schema'] as const)
          : (['error', 'length'] as const)) {
          await newConversation();
          outcome = failed;
          await send.click();
          await expect(page.getByRole('alert').first()).toBeVisible({
            timeout: 15_000,
          });
          await expect(
            page.locator('.wb:visible .wb-summary button:enabled'),
          ).toHaveCount(0);
          await expect(
            page.locator('.wb:visible .wb-chat .wb-panel-head'),
          ).toContainText('error');
          if (failed === 'schema') {
            outcome = 'success';
            await page
              .getByRole('button', { name: 'First prompt', exact: true })
              .click();
            await send.click();
            await expect(
              page
                .locator('.wb:visible .wb-summary')
                .last()
                .getByRole('button', { name: 'Accept plan', exact: true }),
            ).toBeEnabled({ timeout: 15_000 });
            await expect(
              page.locator('.wb:visible .wb-chat .wb-panel-head'),
            ).toContainText('complete');
            await page.getByRole('tab', { name: 'State', exact: true }).click();
            await expect(
              page.locator('.wb:visible .wb-inspector .wb-inspection'),
            ).toContainText('"revision": 0');
          }
        }
        outcome = 'success';
        await newConversation();
        await send.click();
        await expect(
          page.getByRole('button', { name: 'Stop', exact: true }),
        ).toBeEnabled();
        await page.getByRole('button', { name: 'Stop', exact: true }).click();
        await expect(
          page.locator('.wb:visible .wb-chat .wb-panel-head'),
        ).toContainText(/cancelled/);
      }
      if (process.env['WORKBENCH_RECORD'] !== '1') {
        await page.setViewportSize({ width: 390, height: 844 });
        await expectNoHorizontalOverflow(page);
      } else {
        await page.waitForTimeout(800);
      }
      if (!live) {
        const beforeNavigation = requests.length;
        const target = lesson.id === 'tools' ? 'structured-output' : 'tools';
        await page
          .locator(`.wb:visible .wb-lessons a[href$="lesson=${target}"]`)
          .click();
        await expect(page.locator('.wb:visible [data-send]')).toBeEnabled();
        await expect(page.locator('.wb:visible .wb-summary')).toHaveCount(0);
        expect(requests).toHaveLength(beforeNavigation);
      }
      expect(errors).toEqual([]);
      report.push({
        framework,
        lesson: lesson.id,
        phases,
        eventDelayMs,
        ...(lesson.id === 'streaming' ? { previewTitles } : {}),
        source: live ? 'provider' : 'test-fixture',
        requests: captured.length,
        ...(lesson.id === 'debugging'
          ? {
              deniedStatus: 403,
              deniedProviderRequests: 0,
              sameConversationRecovery: true,
              replayRequests,
            }
          : {}),
        ...(lesson.id === 'request-transformation'
          ? { transformations: transformations.length - transformationStart }
          : {}),
        passed: true,
      });
      if (process.env['WORKBENCH_RECORD'] === '1')
        await saveWorkbenchCapture(
          page,
          resolve(
            work,
            `${framework}-${lesson.id}-${live ? 'live' : 'fixture'}.capture.json`,
          ),
        );
      saveCheckpoint();
      const video = page.video();
      await page.close();
      if (video)
        await video.saveAs(
          resolve(
            work,
            `${framework}-${lesson.id}-${live ? 'live' : 'fixture'}.webm`,
          ),
        );
    }
  }
  // A cross-origin docs page drives a replay embed; fixtures only.
  if (!live && lessons.some((lesson) => lesson.id === 'tools')) {
    report.push(
      await verifyEmbedWorkbench({
        browser,
        origin: `http://127.0.0.1:${address.port}`,
      }),
    );
    saveCheckpoint();
  }
  writeFileSync(
    resolve(work, `${live ? 'live' : 'fixture'}-report.json`),
    JSON.stringify(report, null, 2),
  );
  saveCheckpoint(true);
  console.log(JSON.stringify(report));
} finally {
  await nativeLocal?.close();
  pendingPreview?.release();
  pendingPartial?.release();
  pendingFallback?.release();
  await browser.close();
  await new Promise<void>((done) => server.close(() => done()));
}
