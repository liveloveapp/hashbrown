import {
  type Chat,
  type ResumeOptions,
  ɵassertRuntimeMessageSchedulingAllowed,
  type ɵCompletionInputState,
  ɵgetRuntimeSchedulingState,
  ɵreconcileCompletionInput,
} from '@hashbrownai/core';
import { useEffect, useRef } from 'react';
import { useHashbrownSignal } from './use-hashbrown-signal';

/** Submits the latest input only when its runtime owns a schedulable thread. */
export function useCompletionInput<Input>(
  input: Input,
  resume: (options: ResumeOptions) => void,
  setMessages: (messages: Chat.UserMessage[]) => void,
): void {
  const runtime = { resume };
  const scheduling = ɵgetRuntimeSchedulingState(runtime);
  const snapshot = useHashbrownSignal(scheduling);
  const ownership = useRef<ɵCompletionInputState<Input> | undefined>(undefined);

  useEffect(() => {
    const next = ɵreconcileCompletionInput(
      ownership.current,
      input,
      scheduling(),
      !!input,
    );
    if (next.send) {
      try {
        ɵassertRuntimeMessageSchedulingAllowed({ resume });
      } catch {
        // A synchronous claim can precede its signal publication. Retain
        // ownership and reconcile when the runtime publishes its next state.
        return;
      }
      if (input) setMessages([{ role: 'user', content: input }]);
    }
    ownership.current = next.state;
  }, [input, resume, setMessages, scheduling, snapshot]);
}
