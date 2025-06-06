import { Chat, encodeFrame, Frame } from '@hashbrownai/core';
import OpenAI from 'openai';
import { FunctionParameters } from 'openai/resources/shared';
import { genkit } from 'genkit';
import openAI, { gpt35Turbo, gpt4o } from 'genkitx-openai';

// TODO: a mapping between type strings and model Types?

export interface GenkitTextStreamOptions {
  apiKey: string;
  request: Chat.Api.CompletionCreateParams;
  // transformRequestOptions?: (
  //   options: OpenAI.Chat.ChatCompletionCreateParamsStreaming,
  // ) =>
  //   | OpenAI.Chat.ChatCompletionCreateParamsStreaming
  //   | Promise<OpenAI.Chat.ChatCompletionCreateParamsStreaming>;
}

// TODO: need better types throughout
// TODO: can I get genkit types?

export async function* text(
  options: GenkitTextStreamOptions,
): AsyncIterable<Uint8Array> {
  const {
    apiKey,
    request,
    // transformRequestOptions
  } = options;
  const { messages, model, tools, responseFormat, toolChoice, system } =
    request;

  const ai = genkit({
    plugins: [openAI({ apiKey })],
    // model,
    // TODO: mapp models to model types?
    // TODO: Or, figure out how to construct the strings instead
    model: gpt4o,
  });

  console.log(model);

  // TODO: if it does Zod + streaming, can I say that a particular
  // string or field shouldn't be streamed, or does it do it for
  // everything?

  // TODO: why wrap a wrapper?

  // TODO: do we need to suppport flows out of hte box?

  // TODO: do I need to convert to Zod for schema before passing in?

  try {
    // const baseOptions: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
    // const baseOptions: any = {
    //   stream: true,
    //   // model: model,
    //   messages: [
    //     {
    //       role: 'system',
    //       content: system,
    //     },
    //     ...messages.map((message): OpenAI.ChatCompletionMessageParam => {
    //       if (message.role === 'user') {
    //         return {
    //           role: message.role,
    //           content: message.content,
    //         };
    //       }
    //       if (message.role === 'assistant') {
    //         return {
    //           role: message.role,
    //           content: message.content,
    //           tool_calls:
    //             message.toolCalls && message.toolCalls.length > 0
    //               ? message.toolCalls.map((toolCall) => ({
    //                   ...toolCall,
    //                   type: 'function',
    //                   function: {
    //                     ...toolCall.function,
    //                     arguments: JSON.stringify(toolCall.function.arguments),
    //                   },
    //                 }))
    //               : undefined,
    //         };
    //       }
    //       if (message.role === 'tool') {
    //         return {
    //           role: message.role,
    //           content: JSON.stringify(message.content),
    //           tool_call_id: message.toolCallId,
    //         };
    //       }

    //       throw new Error(`Invalid message role`);
    //     }),
    //   ],
    //   tools:
    //     tools && tools.length > 0
    //       ? tools.map((tool) => ({
    //           type: 'function',
    //           function: {
    //             name: tool.name,
    //             description: tool.description,
    //             parameters: tool.parameters as FunctionParameters,
    //             strict: true,
    //           },
    //         }))
    //       : undefined,
    //   tool_choice: toolChoice,
    //   response_format: responseFormat
    //     ? {
    //         type: 'json_schema',
    //         json_schema: {
    //           strict: true,
    //           name: 'schema',
    //           description: '',
    //           schema: responseFormat as Record<string, unknown>,
    //         },
    //       }
    //     : undefined,
    // };

    // const resolvedOptions: OpenAI.Chat.ChatCompletionCreateParams =
    //   transformRequestOptions
    //     ? await transformRequestOptions(baseOptions)
    //     : baseOptions;

    // const { stream } = ai.generateStream(baseOptions);
    const { stream } = ai.generateStream({
      system,
      // TODO: Remove this and translate our messages to their messages schema
      prompt: 'Generate a set of components for my smart home UI.',
      output: {
        jsonSchema: responseFormat,
      },
    });

    // TODO: what to do with messages with role "model"?

    for await (const chunk of stream) {
      // console.log(chunk);
      console.log('showing chunk');
      console.log(chunk.content);
      // console.log('!!!!!!!!!! text');
      // console.log(chunk.text);
      console.log('!!!!!!!!!!!!!! accum text');
      console.log(chunk.accumulatedText);
      // console.log(JSON.stringify(chunk.output));
      // const chunkMessage: Chat.Api.CompletionChunk = {
      //   choices: chunk.choices.map(
      //     (choice): Chat.Api.CompletionChunkChoice => ({
      //       index: choice.index,
      //       delta: {
      //         content: choice.delta.content,
      //         role: choice.delta.role,
      //         toolCalls: choice.delta.tool_calls,
      //       },
      //       finishReason: choice.finish_reason,
      //     }),
      //   ),
      // };
      const chunkMessage: Chat.Api.CompletionChunk = {
        choices: [
          {
            index: chunk.index,
            delta: {
              content: chunk.content[0].text,
              role: chunk.role === 'model' ? 'assistant' : chunk.role,
              toolCalls: [],
            },
            // TODO: what should this be?
            finishReason: null,
          },
        ],
      };

      const frame: Frame = {
        type: 'chunk',
        chunk: chunkMessage,
      };

      yield encodeFrame(frame);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      const frame: Frame = {
        type: 'error',
        error: error.toString(),
        stacktrace: error.stack,
      };

      yield encodeFrame(frame);
    } else {
      const frame: Frame = {
        type: 'error',
        error: String(error),
      };

      yield encodeFrame(frame);
    }
  } finally {
    const frame: Frame = {
      type: 'finish',
    };

    yield encodeFrame(frame);
  }
}
