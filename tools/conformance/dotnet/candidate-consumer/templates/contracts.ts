import type {
  BrowserRecoveryOutcome,
  Chat,
  PendingConversationRecovery,
  ResumeConversationRecoveryOptions,
} from '@hashbrownai/core';
import type { Signal } from '@angular/core';
import type * as React from '@hashbrownai/react';
import type * as Angular from '@hashbrownai/angular';

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;
type Pending = PendingConversationRecovery | undefined;
type Command = (options: ResumeConversationRecoveryOptions) => void;
type ReactResults = [
  React.UseChatResult<Chat.AnyTool>,
  React.UseCompletionResult,
  React.UseStructuredChatResult<{ title: string }, Chat.AnyTool>,
  React.UseStructuredCompletionResult<{ title: string }>,
  React.UiChatResult<Chat.AnyTool>,
  React.UseUiCompletionResult<Chat.AnyTool>,
];
type AngularResults = [
  Angular.ChatResourceRef<Chat.AnyTool>,
  Angular.CompletionResourceRef,
  Angular.StructuredChatResourceRef<{ title: string }, Chat.AnyTool>,
  Angular.StructuredCompletionResourceRef<{ title: string }>,
  Angular.UiChatResourceRef<Chat.AnyTool>,
  Angular.UiCompletionResourceRef<Chat.AnyTool>,
];
type ReactContract<T> = T extends {
  pendingConversationRecovery: infer P;
  resumeConversationRecovery: infer C;
}
  ? Equal<P, Pending> extends true
    ? Equal<C, Command>
    : false
  : false;
type AngularContract<T> = T extends {
  pendingConversationRecovery: infer P;
  resumeConversationRecovery: infer C;
}
  ? Equal<P, Signal<Pending>> extends true
    ? Equal<C, Command>
    : false
  : false;
type ReactTuple<T extends readonly unknown[]> = {
  [K in keyof T]: ReactContract<T[K]>;
};
type AngularTuple<T extends readonly unknown[]> = {
  [K in keyof T]: AngularContract<T[K]>;
};
type ReactChecks = Assert<
  Equal<ReactTuple<ReactResults>, [true, true, true, true, true, true]>
>;
type AngularChecks = Assert<
  Equal<AngularTuple<AngularResults>, [true, true, true, true, true, true]>
>;
type CoreNotAny = Assert<Equal<IsAny<PendingConversationRecovery>, false>>;
type OutcomeNotAny = Assert<Equal<IsAny<BrowserRecoveryOutcome>, false>>;
type OptionsNotAny = Assert<
  Equal<IsAny<ResumeConversationRecoveryOptions>, false>
>;

/** Directly compiles actual commands without invoking a browser runtime. */
export function compileRecoveryCommands(
  react: ReactResults[number],
  angular: AngularResults[number],
  options: ResumeConversationRecoveryOptions,
): void {
  react.resumeConversationRecovery(options);
  angular.resumeConversationRecovery(options);
  const pending: Pending = react.pendingConversationRecovery;
  const angularPending: Pending = angular.pendingConversationRecovery();
  void pending;
  void angularPending;
  // @ts-expect-error Complete outcomes are required.
  react.resumeConversationRecovery({ batchId: 'incomplete' });
  // @ts-expect-error Public recovery requires explicit options.
  angular.resumeConversationRecovery();
  // @ts-expect-error A known outcome must include a JSON value.
  const incomplete: BrowserRecoveryOutcome = {
    toolCallId: 'original',
    status: 'result',
  };
  void incomplete;
}

/** Exact six-facade public declarations and non-any core contracts compiled by the consumer. */
export type CompiledContracts = [
  ReactChecks,
  AngularChecks,
  CoreNotAny,
  OutcomeNotAny,
  OptionsNotAny,
];
