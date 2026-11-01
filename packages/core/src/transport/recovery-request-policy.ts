import type { TransportRequest } from './transport';

const coldRecoveryRequests = new WeakSet<TransportRequest['input']>();

/** Associates a fully prepared cold checkpoint with its private no-replay policy. @internal */
export function markColdRecoveryRequest(
  input: TransportRequest['input'],
): void {
  coldRecoveryRequests.add(input);
}

/** Reads owned request policy without inspecting or extending provider-visible data. @internal */
export function isColdRecoveryRequest(
  input: TransportRequest['input'],
): boolean {
  return coldRecoveryRequests.has(input);
}
