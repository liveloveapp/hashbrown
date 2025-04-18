import { ToolCallResult } from './ToolCallResult';

export interface ToolMessage {
  role: 'tool';
  content: ToolCallResult;
  tool_call_id: string;
  tool_name: string;
}
