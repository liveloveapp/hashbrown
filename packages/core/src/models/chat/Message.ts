import { AssistantMessage } from './AssistantMessage';
import { SystemMessage } from './SystemMessage';
import { ToolMessage } from './ToolMessage';
import { UserMessage } from './UserMessage';

export type Message<AssistantOutput = string> =
  | SystemMessage
  | UserMessage
  | AssistantMessage<AssistantOutput>
  | ToolMessage;
