import { Chat, encodeFrame, Frame } from '@hashbrownai/core';
import { genkit } from 'genkit';
// NB: getting genkit from beta to have access to defineInterrupt
// import { genkit } from 'genkit/beta';
import openAI from 'genkitx-openai';
export interface GenkitTextStreamOptions {
  apiKey: string;
  request: Chat.Api.CompletionCreateParams;
}

// TODO: also bring in azure-open AI plugin

// TODO: add logic to decide which plugin (or no plugin) to use based on
// provided model (ex: openai/ means use the openAI plugin)

// TODO: verify tool calling with each set of supported models, since there is
// some indication it may be different

type GenkitToolCall = {
  name: string;
  input: string;
  ref: string;
};

export async function* text(
  options: GenkitTextStreamOptions,
): AsyncIterable<Uint8Array> {
  const { apiKey, request } = options;
  const { messages, model, tools, responseFormat, toolChoice, system } =
    request;
  const ai = genkit({
    plugins: [openAI({ apiKey })],
    model,
  });

  try {
    // const baseOptions: any = {
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
    //   tool_choice: toolChoice,
    // };

    console.log(messages);

    // console.log(tools);

    // const answers = messages
    //   .filter((message) => message.role === 'tool')
    //   .map((message) => {});

    const { stream } = ai.generateStream({
      system,
      messages: messages.map((message) => {
        return {
          content: [
            {
              text: message.content,
            },
          ],
          role: message.role === 'assistant' ? 'model' : message.role,
        };
      }) as any[],
      output: {
        jsonSchema: responseFormat,
      },
      tools:
        tools && tools.length > 0
          ? tools.map((tool) => {
              return ai.defineTool(
                {
                  name: tool.name,
                  description: tool.description,
                  inputJsonSchema: tool.parameters,
                },
                async () => {
                  console.log('in function call');
                  return 'noop';
                },
              );
            })
          : undefined,
      toolChoice,
      // ...()
      // resume: {
      //   respond:
      // },
    });

    /*
    reference:

      GenerateResponseChunk {                                                     ┃
      ┃    index: 0,                                                                 ┃
      ┃    role: 'model',                                                            ┃
      ┃    content: [ { toolRequest: [Object] } ],                                   ┃
      ┃    custom: undefined,                                                        ┃
      ┃    previousChunks: [],                                                       ┃
      ┃    parser: [Function: parseChunk]                                            ┃
      ┃  }                                                                           ┃
      ┃  {                                                                           ┃
      ┃    toolRequest: {                                                            ┃
      ┃      name: 'getPageHTML',                                                    ┃
      ┃      ref: 'call_jvX7EMjI8VRS1iQZvAARbsHE',                                   ┃
      ┃      input: ''                                                               ┃
      ┃    }                                                                         ┃
      ┃  }
    */

    // TODO: build or find types for response, tool calls, etc.

    /*
      ok, so, streaming cannot do interrupts.  And interrupts appear to require 
      state (gotta answer on a question object) that Hashbrown doesn't need, and feels icky.

      Therefore, interruptions don't seem to fit out goals. 

      I can try one of two things instead:
      * let the tool call as a no-op and try to catch this on the frontend, 
        send back a response for the tool, and "inject" it into the message stream
      * Try to define tools for, say, openai without going through Genkit's defineTool to see 
        if I can handle them in the usual way, but requiring model awareness.

    */

    // NB: Can't do streaming yet with interrupts.
    // See: https://github.com/firebase/genkit/issues/1816

    for await (const chunk of stream) {
      console.log(chunk);
      if (chunk.content.length > 0) {
        console.log(chunk.content[0]);
      }

      // console.log(chunk.interrupts());

      const chunkMessage: Chat.Api.CompletionChunk = {
        choices: chunk.content.map((content, index) => {
          return {
            index,
            delta: {
              content: content.text,
              role: chunk.role === 'model' ? 'assistant' : chunk.role,
              toolCalls:
                content.toolRequest && content.toolRequest.name != null
                  ? [
                      {
                        index,
                        id: content.toolRequest.ref,
                        type: 'function',
                        function: {
                          name: content.toolRequest.name,
                          // TODO: find a way to remove 'as string'
                          arguments:
                            content.toolRequest.input === ''
                              ? '{}'
                              : (content.toolRequest.input as string),
                        },
                      },
                    ]
                  : [],
            },
            finishReason: null,
          };
        }),
      };

      // console.log(chunk);

      const frame: Frame = {
        type: 'chunk',
        chunk: chunkMessage,
      };

      yield encodeFrame(frame);
    }
  } catch (error: unknown) {
    console.log(error);
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
    console.log('sending finish');
    const frame: Frame = {
      type: 'finish',
    };

    yield encodeFrame(frame);
  }
}
