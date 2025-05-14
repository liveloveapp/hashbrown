export interface ChatMiddleware {
  (requestInit: RequestInit): RequestInit | Promise<RequestInit>;
}
