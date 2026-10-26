import { HashbrownTypeSafe } from '@hashbrownai/typesafe';
import { workbenchDecisionSchema } from '../runtime/workbench';
import { createWorkbenchOpenAIStream } from './workbench-openai';
import { resolve } from 'node:path';
import { createWorkbenchApp } from './workbench-app';

const apiKey = process.env['OPENAI_API_KEY'];
const model = process.env['OPENAI_MODEL'];
if (!apiKey || !model)
  throw new Error(
    'Set OPENAI_API_KEY and OPENAI_MODEL in the server environment.',
  );

const decisionKey = process.env['TYPESAFE_API_KEY'];
const decisionModel = process.env['TYPESAFE_MODEL'];
const app = createWorkbenchApp({
  decide:
    decisionKey && decisionModel
      ? (request, signal) =>
          HashbrownTypeSafe.decide({
            apiKey: decisionKey,
            model: decisionModel,
            request,
            schema: workbenchDecisionSchema,
            signal,
            maxRequestChars: 16_000,
          })
      : undefined,
  staticDirectory: resolve('dist/docs-workbench/browser'),
  stream: createWorkbenchOpenAIStream({ apiKey, model }),
});
app.listen(4370, '127.0.0.1', () =>
  console.log(
    'Canonical docs demo: http://127.0.0.1:4370/react.html and /angular.html',
  ),
);
