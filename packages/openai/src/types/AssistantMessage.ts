export interface AssistantMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: {
    index: number;
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }[];
}
