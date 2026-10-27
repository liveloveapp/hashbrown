import { createWorkbenchWorkflowStream } from './workbench-workflows';
import { HashbrownTypeSafe } from '@hashbrownai/typesafe';
import { workbenchSelectionSchema } from '../runtime/workbench-recipes';
import { workbenchDecisionSchema } from '../runtime/workbench';
import { createWorkbenchOpenAIStream } from './workbench-openai';
import type { Express } from 'express';
import {
  createWorkbenchApp,
  type WorkbenchServerOptions,
} from './workbench-app';

/**
 * Builds the workbench app from server environment: OpenAI for chat lessons
 * (required) and TypeSafe for decision lessons (optional; they answer 503
 * without it). The local server and the hosted Vercel function share this.
 */
export function createWorkbenchAppFromEnv(
  env: NodeJS.ProcessEnv,
  options: Pick<WorkbenchServerOptions, 'staticDirectory' | 'maxActive'> = {},
): Express {
  const apiKey = env['OPENAI_API_KEY'];
  const model = env['OPENAI_MODEL'];
  if (!apiKey || !model)
    throw new Error(
      'Set OPENAI_API_KEY and OPENAI_MODEL in the server environment.',
    );

  const decisionKey = env['TYPESAFE_API_KEY'];
  const decisionModel = env['TYPESAFE_MODEL'];
  return createWorkbenchApp({
    ...options,
    decide:
      decisionKey && decisionModel
        ? (request, signal, lesson) =>
            HashbrownTypeSafe.decide({
              apiKey: decisionKey,
              model: decisionModel,
              request,
              schema:
                lesson === 'ui-selection'
                  ? workbenchSelectionSchema
                  : workbenchDecisionSchema,
              signal,
              maxRequestChars: 16_000,
            })
        : undefined,
    stream: createWorkbenchWorkflowStream({
      delegate: createWorkbenchOpenAIStream({ apiKey, model }),
    }),
  });
}
