import { ɵownAgUiJsonValue } from '../reducers/ag-ui-json-value';

/** CUSTOM event name for a provider-native response history footer. @internal */
export const ɵPROVIDER_HISTORY_EVENT_NAME = 'hashbrown.provider-history';

/** Canonical message metadata key for provider-native response history. @internal */
export const ɵPROVIDER_HISTORY_METADATA_KEY = 'hashbrown.provider-history';

/** An owned provider-native response capture, independent of display fields. @internal */
export interface ɵProviderHistory {
  readonly v: 1;
  readonly provider: string;
  readonly ownerMessageId: string;
  readonly responseId: string;
  readonly complete: boolean;
  readonly payload: Record<string, unknown>;
}

/**
 * Validates and deeply owns a JSON provider history envelope.
 *
 * @param value - An untrusted footer or canonical metadata value.
 * @returns A frozen owned envelope, or `undefined` for malformed or unknown versions.
 * @internal
 */
export function ɵreadProviderHistory(
  value: unknown,
): ɵProviderHistory | undefined {
  try {
    const owned = ɵownAgUiJsonValue(value);
    if (typeof owned !== 'object' || owned === null || Array.isArray(owned)) {
      return undefined;
    }
    const record = owned as Record<string, unknown>;
    if (
      record['v'] !== 1 ||
      !nonemptyString(record['provider']) ||
      !nonemptyString(record['ownerMessageId']) ||
      !nonemptyString(record['responseId']) ||
      typeof record['complete'] !== 'boolean' ||
      typeof record['payload'] !== 'object' ||
      record['payload'] === null ||
      Array.isArray(record['payload'])
    ) {
      return undefined;
    }
    return owned as ɵProviderHistory;
  } catch {
    return undefined;
  }
}

function nonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
