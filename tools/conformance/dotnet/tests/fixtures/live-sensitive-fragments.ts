/** Generates every intentionally emitted sensitive fragment; full-value-only scans miss split log records. */
export function liveSensitiveFragments(value: string): readonly string[] {
  const middle = Math.floor(value.length / 2);
  return Object.freeze([value, value.slice(0, middle), value.slice(middle)]);
}

/** Returns false if any persisted file or captured output contains any emitted sensitive fragment. */
export function excludesLiveSensitiveFragments(
  outputs: readonly string[],
  fragments: readonly string[],
): boolean {
  return fragments.every(
    (fragment) =>
      fragment.length > 0 &&
      outputs.every((output) => !output.includes(fragment)),
  );
}
