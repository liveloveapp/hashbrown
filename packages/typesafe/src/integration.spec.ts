import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { s } from '@hashbrownai/core';
import type { Decision } from '@hashbrownai/core';
import { HashbrownTypeSafe } from './decide.fn';
import * as nativeRequest from './native/__fixtures__/request.json';
import * as nativeResponse from './native/__fixtures__/response.json';

const request: Decision.Request = {
  state: 'Payouts have been failing for 3 days.',
  questions: {
    is_urgent: { type: 'yesNo', instructions: 'Does this convey urgency?' },
    department: {
      type: 'choice',
      instructions: 'Which team should handle this?',
      options: { billing: 'Payments and refunds', technical: null },
    },
    frustration: {
      type: 'score',
      instructions: 'How frustrated is the customer?',
      levels: { '0': 'Calm', '1': 'Frustrated', '2': 'Very angry' },
    },
  },
};

async function readBody(req: IncomingMessage): Promise<string> {
  let text = '';
  for await (const chunk of req) text += chunk;
  return text;
}

test('replays the recorded fixtures over HTTP', async () => {
  const seen: { path?: string; auth?: string; body?: unknown } = {};
  const server = createServer(async (req, res) => {
    seen.path = req.url;
    seen.auth = req.headers.authorization;
    seen.body = JSON.parse(await readBody(req));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(nativeResponse));
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    const { port } = server.address() as AddressInfo;

    const result = await HashbrownTypeSafe.decide({
      apiKey: 'test-key',
      model: 'jev-latest',
      request,
      baseURL: `http://127.0.0.1:${port}`,
    });

    expect(seen.path).toBe('/v1/systemone');
    expect(seen.auth).toBe('Bearer test-key');
    expect(seen.body).toEqual(nativeRequest);
    expect(result.value).toEqual({
      is_urgent: true,
      department: 'billing',
      frustration: 1,
    });
    expect(result.usage).toEqual({ inputTokens: 296, outputTokens: 20 });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

(process.env['TYPESAFE_API_KEY'] ? test : test.skip)(
  'answers a two-question schema from the live API',
  async () => {
    const schema = s.object('Triage', {
      urgent: s.boolean('Is the message urgent?'),
      team: s.enumeration('Which team should handle it?', [
        'billing',
        'technical',
      ]),
    });

    const result = await HashbrownTypeSafe.decide({
      apiKey: process.env['TYPESAFE_API_KEY'] as string,
      model: 'jev-1.14.0',
      schema,
      request: { state: 'Payouts have been failing for 3 days.' },
    });

    expect(result.kind).toBe('hashbrown.decision');
    expect(Object.keys(result.meta).sort()).toEqual(['team', 'urgent']);
  },
  60_000,
);
