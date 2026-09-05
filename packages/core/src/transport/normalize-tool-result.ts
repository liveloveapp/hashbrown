/**
 * Converts any locally fulfilled tool value to outbound-safe text.
 *
 * @internal
 */
export function normalizeToolResult(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }

  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized === 'string') {
      return serialized;
    }
  } catch {
    // Fall through to string coercion.
  }

  try {
    return String(value);
  } catch {
    return '';
  }
}

/**
 * Converts any locally rejected tool reason to outbound-safe text.
 *
 * @internal
 */
export function normalizeToolRejection(reason: unknown): string {
  try {
    if (reason instanceof Error) {
      return normalizeToolResult(reason.message);
    }
  } catch {
    // Fall through to total value normalization.
  }

  return normalizeToolResult(reason);
}
