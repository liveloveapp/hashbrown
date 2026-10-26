/** Public, sanitized observation of mapped provider request options. */
export interface WorkbenchRequestSummary {
  readonly model: string | null;
  readonly instructions: string | null;
  readonly toolNames: readonly string[];
  readonly responseFormat: unknown;
  readonly store?: boolean | null;
  readonly include?: readonly string[] | null;
  readonly maxOutputTokens?: number | null;
}
/** Read-only evidence from the real adapter callback, without input, headers or credentials. */
export interface WorkbenchTransformationTrace {
  readonly before: WorkbenchRequestSummary;
  readonly after: WorkbenchRequestSummary;
  readonly preserved: Readonly<Record<string, boolean>>;
}
