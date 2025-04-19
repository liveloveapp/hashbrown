export type CompletionChunk = {
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
    finish_reason: string | null;
  }[];
};
