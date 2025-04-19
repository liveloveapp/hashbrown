export type ToolCallResult =
  | { type: 'success'; content: object }
  | { type: 'error'; error: string };
