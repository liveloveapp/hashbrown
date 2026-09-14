import type { ɵRuntimeSchedulingState } from './chat-runtime';

/** Input ownership retained by completion adapters. @internal */
export interface ɵCompletionInputState<Input> {
  readonly threadEpoch: number;
  readonly input?: Input;
  readonly hasInput: boolean;
  readonly awaitingResume?: number;
}

/**
 * Reconciles the latest completion input against runtime settlement ownership.
 * The caller commits the returned state only after any requested send succeeds.
 * @param previous - Ownership from the previous reconciliation.
 * @param input - The latest input, compared using existing identity semantics.
 * @param runtime - The live runtime scheduling projection.
 * @param eligible - Whether this adapter accepts the input for generation.
 * @returns The next ownership and whether the input should be submitted.
 * @internal
 */
export function ɵreconcileCompletionInput<Input>(
  previous: ɵCompletionInputState<Input> | undefined,
  input: Input,
  runtime: ɵRuntimeSchedulingState,
  eligible: boolean,
): { readonly state: ɵCompletionInputState<Input>; readonly send: boolean } {
  const current =
    previous?.threadEpoch === runtime.threadEpoch
      ? previous
      : { threadEpoch: runtime.threadEpoch, hasInput: false };

  if (runtime.pending || runtime.isResuming || runtime.recoveryRequired) {
    return {
      state: { ...current, awaitingResume: runtime.successfulResumes },
      send: false,
    };
  }
  if (
    current.awaitingResume !== undefined &&
    current.awaitingResume === runtime.successfulResumes
  ) {
    return { state: current, send: false };
  }
  return {
    state: { threadEpoch: runtime.threadEpoch, input, hasInput: true },
    send: eligible && (!current.hasInput || !Object.is(current.input, input)),
  };
}
