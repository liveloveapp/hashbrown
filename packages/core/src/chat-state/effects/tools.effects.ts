import { s } from '../../schema';
import { createEffect } from '../../utils/micro-ngrx';
import { apiActions, internalActions } from '../actions';
import { Chat } from '../models';
import { selectToolEntities } from '../reducers';

export const runTools = createEffect((store) => {
  const abortController = new AbortController();

  store.when(apiActions.generateMessageSuccess, async (action) => {
    const message = action.payload;

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return;
    }

    const toolEntities = store.read(selectToolEntities);
    const toolCalls = message.tool_calls;

    const toolCallResults = toolCalls.map((toolCall) => {
      const tool = toolEntities[toolCall.function.name];

      if (!tool) {
        return Promise.reject(
          new Error(`Tool ${toolCall.function.name} not found`),
        );
      }

      try {
        const args = s.parse(
          tool.schema,
          JSON.parse(toolCall.function.arguments),
        );

        return Promise.resolve(tool.handler(args, abortController.signal));
      } catch (error) {
        return Promise.reject(error);
      }
    });

    const results = await Promise.allSettled(toolCallResults);
    const toolMessages: Chat.Api.ToolMessage[] = toolCalls.map(
      (toolCall, index) => ({
        role: 'tool',
        content: results[index],
        tool_call_id: toolCall.id,
        tool_name: toolCall.function.name,
      }),
    );

    store.dispatch(internalActions.runToolCallsSuccess({ toolMessages }));
  });

  return () => {
    abortController.abort();
  };
});
