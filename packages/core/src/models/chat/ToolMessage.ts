export interface ToolMessage {
  role: 'tool';
  content: PromiseSettledResult<any>;
  tool_call_id: string;
  tool_name: string;
}
