import { Chat, encodeFrame, Frame } from '@hashbrownai/core';
// import OpenAI from 'openai';
// import { FunctionParameters } from 'openai/resources/shared';

import { Output, Schema, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

// TODO: fix types
export interface VercelAITextStreamOptions {
  apiKey: string;
  request: Chat.Api.CompletionCreateParams;
  // ) =>
  //   // | OpenAI.Chat.ChatCompletionCreateParamsStreaming
  //   // | Promise<OpenAI.Chat.ChatCompletionCreateParamsStreaming>;
  //   any | Promise<any
}

export async function* text(
  options: VercelAITextStreamOptions,
): AsyncIterable<Uint8Array> {
  const { apiKey, request } = options;
  const { messages, model, tools, responseFormat, toolChoice, system } =
    request;

  // const openai = new OpenAI({
  //   apiKey,
  // });

  try {
    //   const baseOptions: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
    //     stream: true,
    //     model: model,
    //     messages: [
    //       {
    //         role: 'system',
    //         content: system,
    //       },
    //       ...messages.map((message): OpenAI.ChatCompletionMessageParam => {
    //         if (message.role === 'user') {
    //           return {
    //             role: message.role,
    //             content: message.content,
    //           };
    //         }
    //         if (message.role === 'assistant') {
    //           return {
    //             role: message.role,
    //             content: message.content,
    //             tool_calls:
    //               message.toolCalls && message.toolCalls.length > 0
    //                 ? message.toolCalls.map((toolCall) => ({
    //                     ...toolCall,
    //                     type: 'function',
    //                     function: {
    //                       ...toolCall.function,
    //                       arguments: JSON.stringify(toolCall.function.arguments),
    //                     },
    //                   }))
    //                 : undefined,
    //           };
    //         }
    //         if (message.role === 'tool') {
    //           return {
    //             role: message.role,
    //             content: JSON.stringify(message.content),
    //             tool_call_id: message.toolCallId,
    //           };
    //         }

    //         throw new Error(`Invalid message role`);
    //       }),
    //     ],
    //     tools:
    //       tools && tools.length > 0
    //         ? tools.map((tool) => ({
    //             type: 'function',
    //             function: {
    //               name: tool.name,
    //               description: tool.description,
    //               parameters: tool.parameters as FunctionParameters,
    //               strict: true,
    //             },
    //           }))
    //         : undefined,
    //     tool_choice: toolChoice,
    //     response_format: responseFormat
    //       ? {
    //           type: 'json_schema',
    //           json_schema: {
    //             strict: true,
    //             name: 'schema',
    //             description: '',
    //             schema: responseFormat as Record<string, unknown>,
    //           },
    //         }
    //       : undefined,
    //   };

    // TODO: find or build a type for the options
    const streamTextOptions: any = {
      model: openai(model),
      system,
      prompt: 'Keep it gangsta',
      tools: {},
    };

    if (responseFormat != null) {
      streamTextOptions.experimental_output = Output.object({
        schema: {
          jsonSchema: responseFormat,
        } as Schema,
      });
    }

    const { fullStream } = streamText(streamTextOptions);

    for await (const part of fullStream) {
      console.log(part);

      // TODO: incorporate their example of handling different types
      // switch (part.type) {
      //   case 'text-delta': {
      //     // handle text delta here
      //     break;
      //   }
      //   case 'reasoning': {
      //     // handle reasoning here
      //     break;
      //   }
      //   case 'source': {
      //     // handle source here
      //     break;
      //   }
      //   case 'tool-call': {
      //     switch (part.toolName) {
      //       case 'cityAttractions': {
      //         // handle tool call here
      //         break;
      //       }
      //     }
      //     break;
      //   }
      //   case 'tool-result': {
      //     switch (part.toolName) {
      //       case 'cityAttractions': {
      //         // handle tool result here
      //         break;
      //       }
      //     }
      //     break;
      //   }
      //   case 'finish': {
      //     // handle finish here
      //     break;
      //   }
      //   case 'error': {
      //     // handle error here
      //     break;
      //   }
      // }

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

      // const frame: Frame = {
      //   type: 'chunk',
      //   chunk: chunkMessage,
      // };

      // yield encodeFrame(frame);
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
