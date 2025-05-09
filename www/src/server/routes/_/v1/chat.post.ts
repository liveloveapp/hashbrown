import { Chat } from '@hashbrownai/core';
import { defineEventHandler, setResponseHeader, readBody } from 'h3';
import { HashbrownOpenAI } from '@hashbrownai/openai';

const OPENAI_API_KEY = process.env['OPENAI_API_KEY'] ?? '';

export default defineEventHandler(async (event) => {
  const completionCreateParams = (await readBody(
    event,
  )) as Chat.CompletionCreateParams;

  const stream = HashbrownOpenAI.stream.text(
    OPENAI_API_KEY,
    completionCreateParams,
  );

  setResponseHeader(event, 'Content-Type', 'text/html');
  setResponseHeader(event, 'Cache-Control', 'no-cache');
  setResponseHeader(event, 'Transfer-Encoding', 'chunked');

  for await (const chunk of stream) {
    event.node.res.write(JSON.stringify(chunk));
  }
  event.node.res.end();

  return undefined;
});
