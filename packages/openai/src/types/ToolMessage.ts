export interface ToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
}
