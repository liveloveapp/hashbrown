import { HashbrownTypeSafe } from '@hashbrownai/typesafe';
import { createAgentApp } from './agent-app';

// Credentials and model selection belong on the server. The local example uses
// public fixture data; add hosted identity, ownership and request controls before
// connecting a real customer-data service.
const apiKey = process.env['TYPESAFE_API_KEY'];
const model = process.env['TYPESAFE_MODEL'];
if (!apiKey || !model)
  throw new Error('Set TYPESAFE_API_KEY and TYPESAFE_MODEL in .env');

const app = createAgentApp({
  classify: ({ request, schema, signal }) =>
    HashbrownTypeSafe.decide({
      apiKey,
      model,
      request,
      schema,
      signal,
      maxRequestChars: 16_000,
    }),
});

app.listen(3001, '127.0.0.1', () => {
  console.log('Hashbrown support agent: http://127.0.0.1:3001/api/agent');
});
