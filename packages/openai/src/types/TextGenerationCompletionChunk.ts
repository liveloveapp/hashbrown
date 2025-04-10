export type ChatCompletionChunk = {
  id: string;
  object: string;
  created: number;
  model: string;
  service_tier: 'default' | 'scale' | null | undefined;
  system_fingerprint?: string;
  choices: {
    index: number;
    delta: {
      content?: string | null;
      role?: string;
      tool_calls?: {
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }[];
    };
    logprobs: null;
    finish_reason: string | null;
  }[];
};
