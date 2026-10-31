/** Actual per-thread Python callback and native history observations. */
export interface PydanticState {
  entered: number;
  completed: number;
  cancelled: number;
  failed: number;
  settled: boolean;
  explicitCancel: boolean;
  streamEntered: boolean;
  history: unknown[];
  modelRequests: unknown[][];
  requests: unknown[];
}
/** Isolated ASGI process with HTTP-only execution controls. */
export interface PydanticHost {
  url: string;
  state(threadId: string): Promise<PydanticState>;
  release(threadId: string): Promise<PydanticState>;
  cancel(threadId: string): Promise<PydanticState>;
  waitFor(threadId: string, predicate: (state: PydanticState) => boolean, options?: { timeoutMs?: number }): Promise<PydanticState>;
  stop(): Promise<void>;
}
/** Launch the pinned Python host and await its ready endpoint. */
export function startPydanticHost(options?: { python?: string; startupTimeoutMs?: number }): Promise<PydanticHost>;
