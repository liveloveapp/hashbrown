/** Backend-owned configuration injected into the native provider fixtures. */
export interface ProviderRouteOptions {
  apiKey: string;
  baseURL?: string;
  model: string;
  /** Sends a `plan` activity alongside the model's answer. */
  activities?: boolean;
}
