export interface AssistantMessage<AssistantOutput = string | object> {
  role: 'assistant';
  content?: AssistantOutput;
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
