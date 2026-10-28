export {
  exposeMarkdown,
  type ExposeMarkdownConfig,
} from './expose-markdown.fn';
export {
  exposeComponent,
  type ComponentPropSchema,
  type ExposedComponent,
} from './expose-component.fn';
export {
  getDevelopmentCollectionDiagnostics,
  setDevelopmentCollectionEnabled,
} from './growth/collector';
export type { DevelopmentCollectionDiagnostics } from '@hashbrownai/core';
export {
  HashbrownProvider,
  type HashbrownProviderOptions,
} from './hashbrown-provider';
export {
  useChat,
  type UseChatOptions,
  type UseChatResult,
} from './hooks/use-chat';
export {
  useCompletion,
  type UseCompletionOptions,
  type UseCompletionResult,
} from './hooks/use-completion';
export {
  useDecision,
  type UseDecisionOptions,
  type UseDecisionResult,
} from './hooks/use-decision';
export {
  useImperativeJsonParser,
  type UseImperativeJsonParserResult,
} from './hooks/use-imperative-json-parser';
export {
  useJsonParser,
  type UseJsonParserResult,
} from './hooks/use-json-parser';
export {
  createMagicTextNodeRenderers,
  type MagicTextCaret,
  type MagicTextCaretRenderProps,
  type MagicTextCaretRenderer,
  MagicTextRenderer,
  type MagicTextCitationRenderData,
  type MagicTextNodeRendererKey,
  type MagicTextNodeRenderer,
  type MagicTextNodeRendererProps,
  type MagicTextNodeRenderers,
  type MagicTextRendererProps,
} from './magic-text-renderer';
export { useRuntime, type UseRuntimeOptions } from './hooks/use-runtime';
export { useRuntimeFunction } from './hooks/use-runtime-function';
export {
  useStructuredChat,
  type UseStructuredChatOptions,
  type UseStructuredChatResult,
} from './hooks/use-structured-chat';
export {
  useStructuredCompletion,
  type UseStructuredCompletionOptions,
  type UseStructuredCompletionResult,
} from './hooks/use-structured-completion';
export {
  useUiKit,
  type UiKit,
  type UiKitInput,
  type UiKitOptions,
} from './hooks/use-ui-kit';
export {
  useTool,
  type ToolOptions,
  type ToolOptionsWithInput,
  type ToolOptionsWithoutInput,
  type ToolOptionsWithUnknownSchema,
} from './hooks/use-tool';
export {
  useToolJavaScript,
  type UseToolJavaScriptOptions,
} from './hooks/use-tool-javascript';
export {
  useUiChat,
  type UiAssistantMessage,
  type UiChatMessage,
  type UiChatOptions,
  type UiChatResult,
  type UiChatSchema,
  type UiChatSchemaComponent,
  type UiErrorMessage,
  type UiUserMessage,
} from './hooks/use-ui-chat';
export {
  useUiDecision,
  type UiDecisionCandidate,
  type UiDecisionChat,
  type UseUiDecisionBaseOptions,
  type UseUiDecisionCandidatesOptions,
  type UseUiDecisionCandidatesResult,
  type UseUiDecisionChatDecision,
  type UseUiDecisionChatOptions,
  type UseUiDecisionChatResult,
  type UseUiDecisionOptions,
} from './hooks/use-ui-decision';
export {
  useUiCompletion,
  type UiCompletionOptions,
  type UseUiCompletionResult,
} from './hooks/use-ui-completion';
export {
  groupTurns,
  getServerToolCallLabel,
  groupServerToolCalls,
  collectTurnSources,
  collectTurnAttributions,
  summarizeTurn,
  formatDuration,
  noFlashRemaining,
  NO_FLASH_MS,
  ELAPSED_TICK_MS,
  type Turn,
  type TurnAttribution,
  type TurnSummary,
  type TurnSummaryOptions,
  type ServerToolCallLabelOverride,
  type ServerToolCallLabelOverrides,
  type ServerToolCallGroup,
  type GroupedServerToolCall,
  type GroupServerToolCallsOptions,
} from '@hashbrownai/core';
