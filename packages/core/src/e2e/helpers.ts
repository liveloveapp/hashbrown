import 'dotenv/config';
import * as cors from 'cors';
import * as express from 'express';
import { getPortPromise } from 'portfinder';
import OpenAI from 'openai';
import type { Chat } from '../models';
import type { Hashbrown } from '../hashbrown';

export interface HashbrownServer {
  url: string;
  close: () => void;
}

export async function createHashbrownServer(
  iteratorFactory: (request: Chat.Api.CompletionCreateParams) =>
    | AsyncIterable<Uint8Array>
    | Promise<AsyncIterable<Uint8Array>>,
): Promise<HashbrownServer> {
  const port = await getPortPromise();
  const app = express();

  app.use(express.json());
  app.use(cors());

  app.post('/chat', async (req, res) => {
    const iterator = await iteratorFactory(req.body);
    res.header('Content-Type', 'application/octet-stream');

    for await (const chunk of iterator) {
      res.write(chunk);
    }

    res.end();
  });

  const server = app.listen(port);

  return {
    url: `http://localhost:${port}/chat`,
    close: () => server.close(),
  };
}

export async function waitUntilHashbrownIsSettled(
  hashbrown: Hashbrown<any, any>,
): Promise<void> {
  await new Promise<void>((resolve) => {
    let hasStartedLoading = hashbrown.isLoading();

    hashbrown.isLoading.subscribe((isLoading) => {
      if (isLoading) {
        hasStartedLoading = true;
      }

      if (hasStartedLoading && !isLoading) {
        resolve();
      }
    });
  });

  const errorMessage = hashbrown
    .messages()
    .find((message) => message.role === 'error');

  if (errorMessage) {
    // eslint-disable-next-line no-console
    console.error(errorMessage);
    throw new Error(`Hashbrown error: ${String(errorMessage.content)}`);
  }
}

export interface OpenAIEvalOptions {
  candidate: unknown;
  expectation: string;
  rubric: string;
  fallbackAssertion?: () => void;
  model?: string;
}

export async function expectWithOpenAIEval({
  candidate,
  expectation,
  rubric,
  fallbackAssertion,
  model = 'gpt-5.1-mini',
}: OpenAIEvalOptions): Promise<void> {
  const evalApiKey = process.env['OPENAI_API_KEY'];

  if (!evalApiKey) {
    fallbackAssertion?.();
    return;
  }

  const client = new OpenAI({ apiKey: evalApiKey });
  const candidateText =
    typeof candidate === 'string' ? candidate : JSON.stringify(candidate, null, 2);

  const completion = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You are an evaluator for automated tests. Reply with a JSON object {"pass": boolean, "reason": string}.',
      },
      {
        role: 'user',
        content: `Candidate response:\n${candidateText}\n\nExpectation:\n${expectation}\n\nEvaluation rubric:\n${rubric}`,
      },
    ],
  });

  const messageContent = completion.choices[0]?.message?.content;

  if (!messageContent) {
    throw new Error('Evaluation model did not return a response.');
  }

  const parsed = JSON.parse(messageContent) as { pass?: boolean; reason?: string };

  if (!parsed.pass) {
    throw new Error(parsed.reason ?? 'LLM evaluation failed without a reason.');
  }
}
