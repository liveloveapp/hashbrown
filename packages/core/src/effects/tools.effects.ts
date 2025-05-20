import { s } from '../schema';
import { createEffect } from '../utils/micro-ngrx';
import { apiActions, internalActions } from '../actions';
import { Chat } from '../models';
import { selectPendingToolCalls, selectToolEntities } from '../reducers';

export const runTools = createEffect((store) => {
  const abortController = new AbortController();

  store.when(apiActions.generateMessageSuccess, async () => {
    const toolCalls = store.read(selectPendingToolCalls);
    const toolEntities = store.read(selectToolEntities);

    if (toolCalls.length === 0) {
      return;
    }

    const toolCallResults = toolCalls.map((toolCall) => {
      const tool = toolEntities[toolCall.name];

      if (!tool) {
        return Promise.reject(new Error(`Tool ${toolCall.name} not found`));
      }

      try {
        const args = s.parseJsonSchema(tool.schema, toolCall.arguments);

        return Promise.resolve(tool.handler(args, abortController.signal));
      } catch (error) {
        // We may have received unnecessarily escaped input, so try
        // again with JSON.parse
        if (
          error instanceof Error &&
          error.message.includes('Expected an object at')
        ) {
          try {
            const args = s.parseJsonSchema(
              tool.schema,
              JSON.parse(toolCall.arguments as any),
            );

            return Promise.resolve(tool.handler(args, abortController.signal));
          } catch (error) {
            return Promise.reject(error);
          }
        }

        return Promise.reject(error);
      }
    });

    const results = await Promise.allSettled(toolCallResults);
    const toolMessages: Chat.Api.ToolMessage[] = toolCalls.map(
      (toolCall, index) => ({
        role: 'tool',
        content: results[index],
        tool_call_id: toolCall.id,
        tool_name: toolCall.name,
      }),
    );

    store.dispatch(internalActions.runToolCallsSuccess({ toolMessages }));
  });

  return () => {
    abortController.abort();
  };
});
