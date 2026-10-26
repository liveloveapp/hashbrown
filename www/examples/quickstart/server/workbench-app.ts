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
  if (lesson === 'decisions') throw new Error('Use the decision endpoint');
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
  return {
    ...input,
    messages: [
      {
        id: 'workbench-system',
        role: 'system',
        content: structured ? workbenchStructuredSystem : workbenchSystem,
      },
      ...messages,
    ],
    tools: [
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
        ui: !structured,
        responseSchema: structured
          ? s.toJsonSchema(getWorkbenchPlanSchema(lesson))
          : responseSchema,
      },
    },
  };
}

/** Server-owned stream boundary; tests substitute events without changing either SDK client. */
export interface WorkbenchServerOptions {
  readonly stream: (
    input: RunAgentInput,
    signal: AbortSignal,
  ) => AsyncIterable<AGUIEvent>;
  readonly decide?: (
    request: Decision.Request,
    signal: AbortSignal,
  ) => Promise<Decision.Response>;
  readonly staticDirectory?: string;
  readonly source?: 'provider' | 'test-fixture';
}

/** A loopback development host with bounded input, single-run admission and disconnect cancellation. */
export function createWorkbenchApp(options: WorkbenchServerOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '128kb' }));
  let active = 0;
  app.post('/api/workbench/decisions', async (req, res) => {
    const origin = req.get('origin');
    if (origin && origin !== `http://${req.get('host')}`) {
      res.status(403).json({ error: 'Use the local same-origin demo' });
      return;
    }
    let request: Decision.Request;
    try {
      request = pinWorkbenchDecisionInput(req.body);
    } catch {
      res.status(400).json({ error: 'Invalid or oversized decision request' });
      return;
    }
    if (!options.decide) {
      res.status(503).json({
        error:
          'Set TYPESAFE_API_KEY and TYPESAFE_MODEL in the server environment to run Decisions.',
      });
      return;
    }
    if (active >= 2) {
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
      const result = await options.decide(request, controller.signal);
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
            'Decision failed. Check the local server and retry, or review the plan manually.',
        });
    } finally {
      clearTimeout(timeout);
      active--;
      if (!res.writableEnded) res.end();
    }
  });
  app.all('/api/workbench/decisions', (_req, res) =>
    res.status(405).json({ error: 'Use POST' }),
  );
  app.post(
    [
      '/api/workbench/chat',
      ...workbenchLessons
        .filter((lesson) => lesson.format !== 'decision')
        .map((lesson) => lesson.endpoint),
    ],
    async (req, res) => {
      const origin = req.get('origin');
      if (origin && origin !== `http://${req.get('host')}`) {
        res.status(403).json({ error: 'Use the local same-origin demo' });
        return;
      }
      let input: RunAgentInput;
      try {
        const lesson = workbenchLessons.find(
          (lesson) => lesson.endpoint === req.path,
        );
        input = pinWorkbenchInput(req.body, lesson?.id);
      } catch {
        res
          .status(400)
          .json({ error: 'Invalid or oversized workbench conversation' });
        return;
      }
      if (active >= 2) {
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
        for await (const event of options.stream(input, controller.signal)) {
          if (controller.signal.aborted) break;
          res.write(encoder.encodeSSE(event));
        }
      } catch {
        if (!controller.signal.aborted)
          res.write(
            encoder.encodeSSE({
              type: EventType.RUN_ERROR,
              message:
                'The demo request failed. Check the local server and retry.',
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
      ...workbenchLessons
        .filter((lesson) => lesson.format !== 'decision')
        .map((lesson) => lesson.endpoint),
    ],
    (_req, res) => res.status(405).json({ error: 'Use POST' }),
  );
  if (options.staticDirectory) app.use(express.static(options.staticDirectory));
  return app;
}

/** Validates a bounded app snapshot and replaces all client-controlled decision questions and policy. */
export function pinWorkbenchDecisionInput(value: unknown): Decision.Request {
  const raw = value as {
    state?: {
      input?: {
        requestId?: unknown;
        prompt?: unknown;
        application?: { revision?: unknown; nextAction?: unknown };
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
    ![null, 'record', 'review', 'clarify'].includes(
      input.application?.nextAction as null,
    )
  )
    throw new Error('Invalid state');
  return {
    state: {
      system: workbenchDecisionSystem,
      input: {
        requestId: input.requestId,
        prompt: input.prompt,
        application: {
          revision: Number(input.application?.revision),
          plan: {
            title: workbenchDecisionPlan.title,
            steps: [...workbenchDecisionPlan.steps],
          },
          nextAction: input.application?.nextAction as null | string,
        },
      },
    },
    questions: {
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
