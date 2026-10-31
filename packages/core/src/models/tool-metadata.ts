import { mergeToolOutcomeMetadata } from './tool-outcome';
import { ɵmergeStepMetadata } from './tool-step';

/** Merge generic tool metadata and retain the legacy producer step compatibility path. */
export function mergeToolMetadata(
  previous: Readonly<Record<string, unknown>> | undefined,
  incoming: Readonly<Record<string, unknown>> | undefined,
  carrier: 'call' | 'message',
  toolCallId?: string,
): Record<string, unknown> | undefined {
  if (incoming === undefined) return previous;
  return mergeToolOutcomeMetadata(
    previous,
    ɵmergeStepMetadata(previous, incoming, carrier, toolCallId),
  );
}
