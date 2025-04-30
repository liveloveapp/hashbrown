export interface AssistantMessage<AssistantOutput = string> {
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
