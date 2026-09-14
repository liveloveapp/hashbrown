import { effect, type Signal } from '@angular/core';
import {
  type Chat,
  type ResumeOptions,
  ɵassertRuntimeMessageSchedulingAllowed,
  type ɵCompletionInputState,
  ɵgetRuntimeSchedulingState,
  ɵreconcileCompletionInput,
} from '@hashbrownai/core';
import { toNgSignal } from '../utils/signals';

/** Connects the latest completion input to runtime settlement and thread ownership. */
export function connectCompletionInput<Input>(
  input: Signal<Input>,
  runtime: {
    resume: (options: ResumeOptions) => void;
    setMessages: (messages: Chat.UserMessage[]) => void;
  },
  clearEmpty = false,
): void {
  const scheduling = ɵgetRuntimeSchedulingState(runtime);
  const snapshot = toNgSignal(scheduling);
  let ownership: ɵCompletionInputState<Input> | undefined;

  effect(() => {
    snapshot();
    const value = input();
    const next = ɵreconcileCompletionInput(
      ownership,
      value,
      scheduling(),
      clearEmpty || !!value,
    );
    if (next.send) {
      try {
        ɵassertRuntimeMessageSchedulingAllowed(runtime);
      } catch {
        // A synchronous claim can precede publication. Keep the prior input
        // ownership until the runtime publishes the state that blocked it.
        return;
      }
      runtime.setMessages(value ? [{ role: 'user', content: value }] : []);
    }
    ownership = next.state;
  });
}
