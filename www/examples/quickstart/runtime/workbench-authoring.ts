import { s } from '@hashbrownai/core';
import type { WorkbenchPlan, WorkbenchStore } from './workbench';

/** Actual framework parser session values; source lifecycle comes separately from SDK history. */
export interface WorkbenchAuthoringObservationInput {
  readonly assistantId: string | null;
  readonly json: string;
  readonly value: unknown;
  readonly complete: boolean;
  readonly error?: unknown;
}
/** Immutable parser and explicit review capture, independent of the accepted application plan. */
export interface WorkbenchAuthoringObservation {
  readonly origin: {
    readonly turn: number;
    readonly revision: number;
    readonly assistantId: string | null;
  };
  readonly source: 'idle' | 'generating' | 'complete' | 'stopped' | 'error';
  readonly json: string;
  readonly parser: {
    readonly value: unknown;
    readonly complete: boolean;
    readonly error: string | null;
  };
  readonly document: WorkbenchPlan | null;
  readonly reviewed: WorkbenchPlan | null;
  readonly applied: boolean;
  readonly error: string | null;
}
/** Schema used by both real parser hooks and the server's JSON response policy. */
export const workbenchAuthoringSchema = s.object('A two-step plan', {
  title: s.string('A concise plan title'),
  steps: s.streaming.array(
    'Exactly two steps',
    s.streaming.string('A concise action'),
  ),
});
/** Server-owned JSON parser instructions; parsing never applies a plan. */
export const workbenchParserSystem =
  'Return only a JSON object with title and steps. Use a short title and exactly two concise string steps: outline the trusted UI demo, then record it. On a follow-up requesting a shorter second step, retain the first step verbatim and shorten the second. Do not execute steps or claim application state changed.';
/** Server-owned forms policy reads actual browser application context before each generation. */
export const workbenchFormsSystem = `${workbenchParserSystem} Before every answer call readContext exactly once to read the current applied plan and revision. The readContext result is the authoritative application-provided applied plan and revision. On follow-up retain its applied first step verbatim, including user edits, rather than copying an older model draft. The user separately reviews, edits and applies the generated draft. Generation never changes application state.`;
/** Checked generation prompts shared by both framework clients. */
export const workbenchAuthoringPrompts = [
  'Create a two-step plan to demonstrate trusted UI.',
  'Make the second step shorter and keep the first step unchanged.',
] as const;
/** Validates and trims all application fields, rejecting unknown or omitted JSON members. */
export function normalizeWorkbenchAuthoringPlan(
  input: unknown,
): WorkbenchPlan | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).some((key) => !['title', 'steps'].includes(key)) ||
    typeof value['title'] !== 'string' ||
    !Array.isArray(value['steps']) ||
    value['steps'].length !== 2 ||
    !value['steps'].every((step) => typeof step === 'string')
  )
    return null;
  const title = value['title'].trim();
  const steps = (value['steps'] as string[]).map((step) => step.trim());
  return title.length > 0 &&
    title.length <= 120 &&
    steps.every((step) => step.length > 0 && step.length <= 200)
    ? { title, steps }
    : null;
}
/** Reparses original complete JSON so parser withholding cannot conceal invalid document members. */
export function decodeWorkbenchAuthoringDocument(
  json: string,
): WorkbenchPlan | null {
  try {
    return normalizeWorkbenchAuthoringPlan(JSON.parse(json));
  } catch {
    return null;
  }
}
/** Captures direct values from a real framework parser hook without synthesizing parser state. */
export function observeAuthoring(
  store: WorkbenchStore,
  observation: WorkbenchAuthoringObservationInput,
): boolean {
  return store.recordAuthoring(observation);
}
/** Binds explicit form actions to the mounted, current live root. */
export function createAuthoringActions(
  store: WorkbenchStore,
  active: () => boolean,
) {
  return {
    /** Copies the fresh validated generated document for review. */
    review: () => active() && store.reviewAuthoring(),
    /** Edits only the application review copy. */
    edit: (field: 'title' | 'step-0' | 'step-1', value: string) =>
      active() && store.editAuthoring(field, value),
    /** Applies a valid current review once. */
    apply: () => active() && store.applyAuthoring(),
  };
}
