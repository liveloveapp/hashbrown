/* eslint-disable @typescript-eslint/no-explicit-any */
import { createEffect } from '../utils/micro-ngrx';
import { apiActions, internalActions } from '../actions';
import { Chat } from '../models';
import {
  selectPendingToolCalls,
  selectToolEntities,
  selectUnifiedError,
} from '../reducers';
import { s } from '../schema';

export const runTools = createEffect((store) => {
  const abortController = new AbortController();

  store.when(apiActions.assistantTurnFinalized, async () => {
    const unifiedError = store.read(selectUnifiedError);
    if (unifiedError) {
      return;
    }

    const toolCalls = store.read(selectPendingToolCalls);
    const toolEntities = store.read(selectToolEntities);

    if (toolCalls.length === 0) {
      await Promise.resolve();
      store.dispatch(internalActions.skippedToolCalls());
      return;
    }

    const toolCallResults = toolCalls.map((toolCall) => {
      const tool = toolEntities[toolCall.name];

      if (!tool) {
        return Promise.reject(new Error(`Tool ${toolCall.name} not found`));
      }

      try {
        const args = s.isHashbrownType(tool.schema)
          ? tool.schema.parseJsonSchema(toolCall.arguments)
          : JSON.parse(toolCall.arguments as any);

        return Promise.resolve(tool.handler(args, abortController.signal));
      } catch (error) {
        // We may have received unnecessarily escaped input, so try
        // again with JSON.parse
        if (
          error instanceof Error &&
          error.message.includes('Expected an object at')
        ) {
          try {
            const args = s.isHashbrownType(tool.schema)
              ? tool.schema.parseJsonSchema(
                  JSON.parse(toolCall.arguments as any),
                )
              : JSON.parse(toolCall.arguments as any);

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
        toolCallId: toolCall.id,
        toolName: toolCall.name,
      }),
    );

    store.dispatch(internalActions.runToolCallsSuccess({ toolMessages }));
  });

  return () => {
    abortController.abort();
  };
});
