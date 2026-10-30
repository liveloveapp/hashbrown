import {
  getWorkbenchUiResponseSchema,
  getWorkbenchUiSystem,
} from '../runtime/workbench-ui-kits';
import {
  workbenchAuthoringSchema,
  workbenchFormsSystem,
  workbenchParserSystem,
} from '../runtime/workbench-authoring';
import { createWorkbenchThreads } from './workbench-threads';
import { workbenchHistorySystem } from '../runtime/workbench-history';
import {
  isWorkbenchWorkflowState,
  workbenchWorkflowSystem,
} from '../runtime/workbench-workflows';
import {
  workbenchConversationSystem,
  workbenchFirstPlanSystem,
  workbenchInstructionsSystem,
} from '../runtime/workbench-onboarding';
import {
  workbenchPredictionsSchema,
  workbenchPredictionsSystem,
  workbenchSelectionOptions,
  workbenchSelectionSystem,
  workbenchTextSystem,
} from '../runtime/workbench-recipes';
import { type AGUIEvent, EventType, type RunAgentInput } from '@ag-ui/core';
import { RunAgentInputSchema } from '@ag-ui/core/schemas';
import { EventEncoder } from '@ag-ui/encoder';
import { type Decision, s } from '@hashbrownai/core';
import express, { type Express } from 'express';
import {
  getWorkbenchPlanSchema,
  workbenchDecisionPlan,
  workbenchDecisionSystem,
  workbenchStructuredSystem,
  workbenchSystem,
} from '../runtime/workbench';

import {
  hostedWorkbenchLessons,
  type WorkbenchLessonId,
  workbenchLessons,
} from '../runtime/workbench-lessons';

const responseSchema = s.toJsonSchema(
  s.object('A trusted plan interface', {
    ui: s.array(
      'The generated interface',
      s.object('A trusted component', {
        SummaryCard: s.object('A plan proposal', {
          props: s.object('Plan fields', {
            title: s.string('A short title'),
            steps: s.array('Exactly two short steps', s.string('A step')),
          }),
        }),
      }),
    ),
  }),
);

/** Validates bounded history and fixes the canonical example's provider instructions and schema. */
export function pinWorkbenchInput(
  value: unknown,
  lesson: WorkbenchLessonId = 'generative-ui',
): RunAgentInput {
  if (workbenchLessons.find((entry) => entry.id === lesson)?.host)
    throw new Error('Use the separate production reference server.');
  if (
    workbenchLessons.find((entry) => entry.id === lesson)?.protocol === 'local'
  )
    throw new Error(
      'Browser-local inference does not use a hosted provider endpoint',
    );
  if (
    workbenchLessons.find((entry) => entry.id === lesson)?.protocol ===
    'runtime'
  )
    throw new Error(
      'Direct runtime execution does not use a provider endpoint',
    );
  if (
    workbenchLessons.find((entry) => entry.id === lesson)?.protocol ===
    'decision'
  )
    throw new Error('Use the decision endpoint');
  const uiLesson =
    lesson === 'ui-kits' || lesson === 'ui-chatbot' ? lesson : null;
  const structured =
    workbenchLessons.find((entry) => entry.id === lesson)?.format ===
    'structured';
  if (JSON.stringify(value).length > 128_000)
    throw new Error('Conversation too large');
  const input = RunAgentInputSchema.parse(value);
  const messages = input.messages.filter(
    (message) => message.role !== 'system' && message.role !== 'developer',
  );
  if (
    messages.length < 1 ||
    messages.length > 80 ||
    !messages.some((message) => message.role === 'user')
  )
    throw new Error('Invalid history');
  if (
    messages.some(
      (message) =>
        message.role === 'user' &&
        (typeof message.content !== 'string' || message.content.length > 2000),
    )
  )
    throw new Error('Prompt too large');
  const workflow =
    workbenchLessons.find((entry) => entry.id === lesson)?.format ===
    'workflow';
  if (workflow && !isWorkbenchWorkflowState(input.state))
    throw new Error('Invalid workflow state');
  const history =
    lesson === 'message-history' ||
    lesson === 'save-text-conversations' ||
    lesson === 'server-threads' ||
    lesson === 'public-endpoint';
  const onboarding =
    lesson === 'first-plan' ||
    lesson === 'conversation' ||
    lesson === 'system-instructions';
  const authoring = lesson === 'json-parser' || lesson === 'natural-forms';
  const agent = lesson === 'agent-decisions';
  const plainText =
    authoring ||
    agent ||
    history ||
    workflow ||
    lesson === 'magic-text' ||
    lesson === 'conversation' ||
    lesson === 'system-instructions';
  return {
    ...input,
    messages: [
      {
        id: 'workbench-system',
        role: 'system',
        content: uiLesson
          ? getWorkbenchUiSystem(uiLesson)
          : lesson === 'json-parser'
            ? workbenchParserSystem
            : lesson === 'natural-forms'
              ? workbenchFormsSystem
              : agent
                ? 'Classify bounded user text using server-owned read-only handlers.'
                : history
                  ? workbenchHistorySystem
                  : workflow
                    ? workbenchWorkflowSystem
                    : lesson === 'first-plan'
                      ? workbenchFirstPlanSystem
                      : lesson === 'conversation'
                        ? workbenchConversationSystem
                        : lesson === 'system-instructions'
                          ? workbenchInstructionsSystem
                          : lesson === 'magic-text'
                            ? workbenchTextSystem
                            : lesson === 'predictions'
                              ? workbenchPredictionsSystem
                              : structured
                                ? workbenchStructuredSystem
                                : workbenchSystem,
      },
      ...messages,
    ],
    tools:
      history ||
      workflow ||
      onboarding ||
      agent ||
      lesson === 'json-parser' ||
      lesson === 'predictions'
        ? []
        : [
            {
              name: 'readContext',
              description:
                'Read the current application plan and revision without changing it.',
              parameters: {
                type: 'object',
                properties: {},
                required: [],
                additionalProperties: false,
              },
            },
          ],
    forwardedProps: {
      hashbrown: {
        ui: !structured && !plainText && lesson !== 'predictions',
        ...(plainText && !authoring
          ? {}
          : {
              responseSchema: uiLesson
                ? getWorkbenchUiResponseSchema(uiLesson)
                : authoring
                  ? s.toJsonSchema(workbenchAuthoringSchema)
                  : lesson === 'predictions'
                    ? s.toJsonSchema(workbenchPredictionsSchema)
                    : structured
                      ? s.toJsonSchema(getWorkbenchPlanSchema(lesson))
                      : responseSchema,
            }),
      },
    },
  };
}

/** Server-owned stream boundary; tests substitute events without changing either SDK client. */
export interface WorkbenchServerOptions {
  readonly stream: (
    input: RunAgentInput,
    signal: AbortSignal,
    lessonId?: WorkbenchLessonId,
  ) => AsyncIterable<AGUIEvent>;
  readonly decide?: (
    request: Decision.Request,
    signal: AbortSignal,
    lessonId?: WorkbenchLessonId,
  ) => Promise<Decision.Response>;
  readonly staticDirectory?: string;
  /** The most runs and decisions this process serves at once; later requests get 429. Defaults to 2. */
  readonly maxActive?: number;
  readonly source?: 'provider' | 'test-fixture';
}

/** Whether a request's Origin, when present, names the host it was sent to, under either scheme. */
function isSameHost(origin: string | undefined, host: string | undefined) {
  if (!origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** A development or hosted demo server with bounded input, capped admission and disconnect cancellation. */
export function createWorkbenchApp(options: WorkbenchServerOptions): Express {
  const maxActive = options.maxActive ?? 2;
  const app = express();
  app.disable('x-powered-by');
  app.use('/api/workbench/server', createWorkbenchThreads(options));
  app.use(express.json({ limit: '128kb' }));
  let active = 0;
  app.post(
    ['/api/workbench/decisions', '/api/workbench/ui-selection'],
    async (req, res) => {
      if (!isSameHost(req.get('origin'), req.get('host'))) {
        res.status(403).json({ error: 'Use the same-origin demo' });
        return;
      }
      let request: Decision.Request;
      try {
        request = pinWorkbenchDecisionInput(
          req.body,
          req.path === '/api/workbench/ui-selection'
            ? 'ui-selection'
            : 'decisions',
        );
      } catch {
        res
          .status(400)
          .json({ error: 'Invalid or oversized decision request' });
        return;
      }
      if (!options.decide) {
        res.status(503).json({
          error:
            'Set TYPESAFE_API_KEY and TYPESAFE_MODEL in the server environment to run Decisions.',
        });
        return;
      }
      if (active >= maxActive) {
        res
          .status(429)
          .json({ error: 'Wait for another conversation to finish' });
        return;
      }
      active++;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      res.once('close', () => controller.abort());
      try {
        const result = await options.decide(
          request,
          controller.signal,
          req.path === '/api/workbench/ui-selection'
            ? 'ui-selection'
            : 'decisions',
        );
        if (!controller.signal.aborted)
          res
            .set({
              'Cache-Control': 'no-store',
              'X-Workbench-Source': options.source ?? 'provider',
            })
            .json(result);
      } catch {
        if (!res.headersSent)
          res.status(502).json({
            error:
              'Decision failed. Try again in a moment, or review the plan manually.',
          });
      } finally {
        clearTimeout(timeout);
        active--;
        if (!res.writableEnded) res.end();
      }
    },
  );
  app.all(
    ['/api/workbench/decisions', '/api/workbench/ui-selection'],
    (_req, res) => res.status(405).json({ error: 'Use POST' }),
  );
  app.post(
    [
      '/api/workbench/chat',
      ...hostedWorkbenchLessons
        .filter((lesson) => lesson.protocol === 'chat')
        .map((lesson) => lesson.endpoint),
    ],
    async (req, res) => {
      if (!isSameHost(req.get('origin'), req.get('host'))) {
        res.status(403).json({ error: 'Use the same-origin demo' });
        return;
      }
      const lesson = workbenchLessons.find(
        (entry) => entry.endpoint === req.path,
      );
      if (lesson?.id === 'debugging' && req.query['demoDenied'] === '1') {
        res
          .status(403)
          .set({
            'Cache-Control': 'no-store',
            'X-Workbench-Source': 'demo-failure',
          })
          .json({
            error:
              'Demo denial is enabled. Disable Demo denial and send again.',
          });
        return;
      }
      let input: RunAgentInput;
      try {
        input = pinWorkbenchInput(req.body, lesson?.id);
      } catch {
        res
          .status(400)
          .json({ error: 'Invalid or oversized workbench conversation' });
        return;
      }
      if (active >= maxActive) {
        res
          .status(429)
          .json({ error: 'Wait for another conversation to finish' });
        return;
      }
      active++;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      res.once('close', () => controller.abort());
      const encoder = new EventEncoder();
      try {
        res.writeHead(200, {
          'Content-Type': encoder.getContentType(),
          'Cache-Control': 'no-store, no-transform',
          'X-Accel-Buffering': 'no',
          'X-Workbench-Source': options.source ?? 'provider',
        });
        for await (const event of options.stream(
          input,
          controller.signal,
          lesson?.id,
        )) {
          if (controller.signal.aborted) break;
          res.write(encoder.encodeSSE(event));
        }
      } catch {
        if (!controller.signal.aborted)
          res.write(
            encoder.encodeSSE({
              type: EventType.RUN_ERROR,
              message:
                'The demo request failed. Try again in a moment.',
            }),
          );
      } finally {
        clearTimeout(timeout);
        active--;
        res.end();
      }
    },
  );
  app.all(
    [
      '/api/workbench/chat',
      ...hostedWorkbenchLessons
        .filter((lesson) => lesson.protocol === 'chat')
        .map((lesson) => lesson.endpoint),
    ],
    (_req, res) => res.status(405).json({ error: 'Use POST' }),
  );
  if (options.staticDirectory) app.use(express.static(options.staticDirectory));
  return app;
}

/** Validates a bounded app snapshot and replaces all client-controlled decision questions and policy. */
export function pinWorkbenchDecisionInput(
  value: unknown,
  lesson: WorkbenchLessonId = 'decisions',
): Decision.Request {
  const raw = value as {
    state?: {
      input?: {
        requestId?: unknown;
        prompt?: unknown;
        application?: {
          revision?: unknown;
          nextAction?: unknown;
          selectedView?: unknown;
        };
      };
    };
  };
  if (JSON.stringify(value).length > 16_000)
    throw new Error('Decision too large');
  const input = raw?.state?.input;
  if (
    !input ||
    typeof input.requestId !== 'string' ||
    input.requestId.length > 100 ||
    typeof input.prompt !== 'string' ||
    !input.prompt.trim() ||
    input.prompt.length > 2000 ||
    !Number.isSafeInteger(input.application?.revision) ||
    Number(input.application?.revision) < 0 ||
    !(lesson === 'ui-selection'
      ? [null, 'summary', 'steps'].includes(
          input.application?.selectedView as null,
        )
      : [null, 'record', 'review', 'clarify'].includes(
          input.application?.nextAction as null,
        ))
  )
    throw new Error('Invalid state');
  return {
    state: {
      system:
        lesson === 'ui-selection'
          ? workbenchSelectionSystem
          : workbenchDecisionSystem,
      input: {
        requestId: input.requestId,
        prompt: input.prompt,
        application: {
          revision: Number(input.application?.revision),
          plan: {
            title: workbenchDecisionPlan.title,
            steps: [...workbenchDecisionPlan.steps],
          },
          ...(lesson === 'ui-selection'
            ? { selectedView: input.application?.selectedView as null | string }
            : { nextAction: input.application?.nextAction as null | string }),
        },
      },
    },
    questions:
      lesson === 'ui-selection'
        ? {
            pick: {
              type: 'choice',
              instructions: 'Which one fits the input best',
              options: Object.fromEntries(
                workbenchSelectionOptions.map(({ id, description }) => [
                  id,
                  description,
                ]),
              ),
            },
          }
        : {
            nextAction: {
              type: 'choice',
              instructions: 'The next useful action',
              options: {
                record: 'Record the demo after the outline is complete.',
                review: 'Review the demo after it has been recorded.',
                clarify: 'Ask for clarification when progress is unclear.',
              },
            },
          },
  };
}
