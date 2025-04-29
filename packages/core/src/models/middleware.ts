export interface ChatMiddleware {
  (
    requestInit: RequestInit,
    abortSignal: AbortSignal,
  ): RequestInit | Promise<RequestInit>;
}
