import type { RunAgentInput } from '@ag-ui/core';
import {
  chromeToolError,
  type ChromeToolValue,
  type prepareChromeToolMessages,
} from './chrome-tool-messages';

/** Application-selected native inference phase. @alpha */
export type ChromeToolPhase =
  | { readonly type: 'tool'; readonly name: string }
  | { readonly type: 'finalize' };
/** Completed canonical tool call and its unmodified result text. @alpha */
export interface ChromeToolPhaseResult {
  readonly callId: string;
  readonly name: string;
  /** Bounded JSON object owned and deeply frozen before the selector runs. Validate nested values before consuming them. */
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly result: {
    readonly type: 'success' | 'error';
    readonly text: string;
  };
}
/** Deeply owned and frozen current user turn supplied to the phase selector. @alpha */
export interface ChromeToolsTurnContext {
  readonly threadId: string;
  readonly runId: string;
  readonly userMessage: { readonly id: string; readonly content: string };
  readonly completedCalls: readonly ChromeToolPhaseResult[];
}
/** Selects a request-local phase from validated canonical history. @internal */
export function selectChromeToolPhase(
  input: RunAgentInput,
  prepared: ReturnType<typeof prepareChromeToolMessages>,
  selector: (context: ChromeToolsTurnContext) => ChromeToolPhase,
): ChromeToolPhase {
  const userIndex = input.messages.reduce(
    (index, message, current) => (message.role === 'user' ? current : index),
    -1,
  );
  const user = input.messages[userIndex];
  if (
    !user ||
    user.role !== 'user' ||
    typeof user.content !== 'string' ||
    typeof user.id !== 'string'
  )
    throw chromeToolError('Tool phases require a canonical user message.');
  const calls = new Map<string, ChromeToolValue>();
  const completedCalls: ChromeToolPhaseResult[] = [];
  for (const message of prepared.messages.slice(userIndex + 1)) {
    if (typeof message.content === 'string') continue;
    for (const part of message.content) {
      if (part.type === 'text') continue;
      const value = part.value as ChromeToolValue;
      if (part.type === 'tool-call') calls.set(value.callId, value);
      else {
        const call = calls.get(value.callId);
        if (!call)
          throw chromeToolError(
            'Current-turn tool result has no current-turn call.',
          );
        completedCalls.push(
          Object.freeze({
            callId: call.callId,
            name: call.name,
            arguments: call.arguments as ChromeToolPhaseResult['arguments'],
            result: Object.freeze(
              value.errorMessage !== undefined
                ? { type: 'error' as const, text: value.errorMessage }
                : {
                    type: 'success' as const,
                    text: value.result?.[0].value ?? '',
                  },
            ),
          }),
        );
      }
    }
  }
  const context: ChromeToolsTurnContext = Object.freeze({
    threadId: input.threadId,
    runId: input.runId,
    userMessage: Object.freeze({ id: user.id, content: user.content }),
    completedCalls: Object.freeze(completedCalls),
  });
  const decision = selector(context);
  if (!decision || typeof decision !== 'object')
    throw chromeToolError('Invalid tool phase decision.');
  if (decision.type === 'finalize') return Object.freeze({ type: 'finalize' });
  if (
    decision.type === 'tool' &&
    prepared.tools.some((tool) => tool.name === decision.name)
  )
    return Object.freeze({ type: 'tool', name: decision.name });
  throw chromeToolError('Invalid or undeclared tool phase decision.');
}
