import { HashbrownOpenAI } from '@hashbrownai/openai';
import { resolve } from 'node:path';
import { createWorkbenchApp } from './workbench-app';

const apiKey = process.env['OPENAI_API_KEY'];
const model = process.env['OPENAI_MODEL'];
if (!apiKey || !model)
  throw new Error(
    'Set OPENAI_API_KEY and OPENAI_MODEL in the server environment.',
  );

const app = createWorkbenchApp({
  staticDirectory: resolve('dist/docs-workbench/browser'),
  stream: (input, signal) =>
    HashbrownOpenAI.stream.text({
      apiKey,
      model,
      input,
      signal,
      transformRequestOptions: (request) => ({
        ...request,
        max_output_tokens: 2048,
      }),
    }),
});
app.listen(4370, '127.0.0.1', () =>
  console.log(
    'Canonical docs demo: http://127.0.0.1:4370/react.html and /angular.html',
  ),
);
