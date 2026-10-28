import { s } from '@hashbrownai/core';
import {
  isWorkbenchPlan,
  type WorkbenchApplication,
  type WorkbenchPlan,
} from './workbench';

/** Maximum editable source length captured by the application. */
export const workbenchJavaScriptCodeLimit = 12000;
/** QuickJS evaluation deadline; host effects are not rolled back by interruption. */
export const workbenchJavaScriptTimeoutMs = 1000;
/** The only arguments exposed to the read-only host capability. */
export const workbenchJavaScriptReadPlanSchema = s.object(
  'Read the current application plan at this revision',
  {
    revision: s.number('The current nonnegative integer application revision'),
  },
);
/** The immutable plan snapshot returned to the JavaScript context. */
export const workbenchJavaScriptPlanResultSchema = s.object(
  'The current application plan snapshot',
  {
    revision: s.number('The application revision'),
    plan: s.object('The application-owned plan', {
      title: s.string('The plan title'),
      steps: s.array(
        'The two plan steps',
        s.string('An application plan step'),
      ),
    }),
  },
);
/** Detached data returned by the read-only host capability. */
export interface WorkbenchJavaScriptPlanResult {
  readonly revision: number;
  readonly plan: WorkbenchPlan;
}
/** An actual host invocation captured while a script executes. */
export interface WorkbenchJavaScriptCall {
  readonly name: 'readPlan';
  readonly args: unknown;
  readonly result?: WorkbenchJavaScriptPlanResult;
  readonly error?: string;
}
/** Bounded immutable observations; executable runtime objects never enter frames. */
export interface WorkbenchJavaScriptObservation {
  readonly runId: string;
  readonly code: string;
  readonly status: 'running' | 'complete' | 'error' | 'cancelled';
  readonly calls: readonly WorkbenchJavaScriptCall[];
  readonly outcome?: unknown;
}
function object(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? (value as Record<string, unknown>)
    : undefined;
}
function immutable<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(immutable);
    Object.freeze(value);
  }
  return value;
}
/** Validates the host boundary independently of schemas and copies only application plan fields. */
export function readWorkbenchJavaScriptPlan(
  args: unknown,
  application: WorkbenchApplication,
): WorkbenchJavaScriptPlanResult {
  const input = object(args);
  if (
    !input ||
    Object.keys(input).length !== 1 ||
    !Object.hasOwn(input, 'revision') ||
    !Number.isSafeInteger(input['revision']) ||
    (input['revision'] as number) < 0
  )
    throw new Error(
      'readPlan requires exactly { revision: a nonnegative safe integer }.',
    );
  if (
    !Number.isSafeInteger(application.revision) ||
    application.revision < 0 ||
    input['revision'] !== application.revision
  )
    throw new Error(
      'readPlan revision must match the current application revision.',
    );
  if (!isWorkbenchPlan(application.plan))
    throw new Error('readPlan requires a valid application plan.');
  return immutable({
    revision: application.revision,
    plan: { title: application.plan.title, steps: [...application.plan.steps] },
  });
}

/** Copies arbitrary outcome data into bounded JSON-compatible values without functions or cycles. */
export function captureWorkbenchJavaScriptValue(value: unknown): unknown {
  let remaining = 12000;
  let nodes = 256;
  const seen = new Set<object>();
  const capture = (input: unknown, depth: number): unknown => {
    if (remaining <= 0 || nodes-- <= 0 || depth > 6) return '[capture limit]';
    if (input === null || typeof input === 'boolean') return input;
    if (typeof input === 'number')
      return Number.isFinite(input) ? input : String(input);
    if (typeof input === 'string') {
      const result = input.slice(0, Math.min(4000, remaining));
      remaining -= result.length;
      return result;
    }
    if (typeof input === 'bigint') return String(input).slice(0, 120);
    if (typeof input !== 'object') return undefined;
    if (seen.has(input)) return '[circular]';
    seen.add(input);
    if (Array.isArray(input))
      return Array.from({ length: Math.min(input.length, 64) }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(
          input,
          String(index),
        );
        return descriptor && 'value' in descriptor
          ? (capture(descriptor.value, depth + 1) ?? null)
          : null;
      });
    const record = object(input);
    if (!record) return '[unsupported value]';
    return Object.fromEntries(
      Object.keys(record)
        .slice(0, 64)
        .flatMap((key) => {
          const descriptor = Object.getOwnPropertyDescriptor(record, key);
          if (!descriptor || !('value' in descriptor)) return [];
          const captured = capture(descriptor.value, depth + 1);
          return captured === undefined ? [] : [[key.slice(0, 120), captured]];
        }),
    );
  };
  return immutable(capture(value, 0));
}
/** Rejects malformed run metadata and safely normalizes bounded host calls and outcomes. */
export function normalizeWorkbenchJavaScriptObservation(
  input: unknown,
): WorkbenchJavaScriptObservation | null {
  const value = object(input);
  if (
    !value ||
    typeof value['runId'] !== 'string' ||
    !value['runId'] ||
    value['runId'].length > 160 ||
    typeof value['code'] !== 'string' ||
    value['code'].length > workbenchJavaScriptCodeLimit ||
    typeof value['status'] !== 'string' ||
    !['running', 'complete', 'error', 'cancelled'].includes(value['status']) ||
    !Array.isArray(value['calls']) ||
    value['calls'].length > 32
  )
    return null;
  const calls: WorkbenchJavaScriptCall[] = [];
  for (const raw of value['calls']) {
    const call = object(raw);
    if (
      !call ||
      call['name'] !== 'readPlan' ||
      !Object.hasOwn(call, 'args') ||
      (call['error'] !== undefined && typeof call['error'] !== 'string')
    )
      return null;
    let result: WorkbenchJavaScriptPlanResult | undefined;
    if (call['result'] !== undefined) {
      const candidate = object(call['result']);
      if (!candidate) return null;
      try {
        result = readWorkbenchJavaScriptPlan(
          { revision: candidate['revision'] },
          candidate as unknown as WorkbenchApplication,
        );
      } catch {
        return null;
      }
    }
    calls.push({
      name: 'readPlan',
      args: captureWorkbenchJavaScriptValue(call['args']),
      ...(result ? { result } : {}),
      ...(typeof call['error'] === 'string'
        ? { error: call['error'].slice(0, 2000) }
        : {}),
    });
  }
  return immutable({
    runId: value['runId'],
    code: value['code'],
    status: value['status'] as WorkbenchJavaScriptObservation['status'],
    calls,
    ...(value['outcome'] === undefined
      ? {}
      : { outcome: captureWorkbenchJavaScriptValue(value['outcome']) }),
  });
}

function estimate(minutes: number): string {
  return `const snapshot = readPlan({ revision: 0 });\nconst stepCount = snapshot.plan.steps.length;\n({\n  revision: snapshot.revision,\n  title: snapshot.plan.title,\n  stepCount,\n  totalMinutes: stepCount * ${minutes},\n});`;
}
/** Explicit application-owned scripts; selecting a preset does not execute it. */
export const workbenchJavaScriptScripts = immutable([
  { id: 'estimate', title: '15 minutes per step', code: estimate(15) },
  { id: 'shorter', title: '10 minutes per step', code: estimate(10) },
  {
    id: 'browser',
    title: 'Missing browser global',
    code: 'document.title;',
  },
  {
    id: 'invalid',
    title: 'Invalid host arguments',
    code: 'readPlan({ revision: "0" });',
  },
  { id: 'loop', title: 'Runtime timeout', code: 'while (true) {}' },
  {
    id: 'fresh',
    title: 'Fresh runtime context',
    code: 'const previous = globalThis.previousRun;\nglobalThis.previousRun = true;\n({ fresh: previous === undefined });',
  },
] as const);
