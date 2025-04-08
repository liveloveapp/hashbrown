import {
  ChatCompletionChunk,
  ChatCompletionWithToolsRequest,
} from '@hashbrownai/angular';
import cors from 'cors';
import express from 'express';
import OpenAI from 'openai';
import { OPEN_AI_API_KEY } from './environment';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const app = express();

app.use(express.json());

app.use(cors());

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});

app.post('/chat', async (req, res) => {
  const openai = new OpenAI({
    apiKey: OPEN_AI_API_KEY,
  });
  const { messages, model, max_tokens, temperature, tools, response_format } =
    req.body as ChatCompletionWithToolsRequest;

  console.log('messages', JSON.stringify(messages, null, 2));
  console.log('tools', JSON.stringify(tools, null, 2));

  const stream = openai.beta.chat.completions.stream({
    model: model,
    messages: messages.map(
      (message): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
        if (message.role === 'user') {
          return {
            role: message.role,
            content: message.content,
          };
        }
        if (message.role === 'assistant') {
          return {
            role: message.role,
            content: message.content,
            tool_calls:
              message.tool_calls && message.tool_calls.length > 0
                ? message.tool_calls.map(
                    (
                      toolCall
                    ): OpenAI.Chat.Completions.ChatCompletionMessageToolCall => ({
                      ...toolCall,
                      type: 'function',
                      function: {
                        ...toolCall.function,
                        arguments: JSON.stringify(toolCall.function.arguments),
                      },
                    })
                  )
                : undefined,
          };
        }
        if (message.role === 'tool') {
          return {
            role: message.role,
            content: JSON.stringify(message.content),
            tool_call_id: message.tool_call_id,
          };
        }
        if (message.role === 'system') {
          return {
            role: message.role,
            content: message.content,
          };
        }

        throw new Error(`Invalid message role`);
      }
    ),
    max_tokens,
    temperature,
    tools,
    response_format: response_format
      ? {
          type: 'json_schema',
          json_schema: {
            strict: true,
            name: 'schema',
            description: response_format.description,
            schema: response_format as Record<string, unknown>,
          },
        }
      : undefined,
  });

  res.header('Content-Type', 'text/plain');

  for await (const chunk of stream) {
    const chunkMessage: ChatCompletionChunk = {
      id: chunk.id,
      object: chunk.object,
      created: chunk.created,
      model: chunk.model,
      service_tier: chunk.service_tier,
      system_fingerprint: chunk.system_fingerprint,
      choices: chunk.choices.map((choice) => ({
        index: choice.index,
        delta: choice.delta,
        logprobs: null,
        finish_reason: choice.finish_reason,
      })),
    };

    res.write(JSON.stringify(chunkMessage));
  }

  res.end();
});
