import type { ServerToolCall, ServerToolCallSource } from './view.models';
import { readRawStepIdentity, ɵTOOL_STEP_METADATA_KEY } from './tool-step';

/**
 * Application wording for one tool and its consecutive successful calls.
 *
 * @public
 */
export interface ServerToolCallLabelOverride {
  /** Resolves wording for a call, or defers to its producer label. */
  readonly label?: (call: Readonly<ServerToolCall>) => string | undefined;
  /** Resolves wording for a group, or defers to derived wording. */
  readonly group?: (
    calls: readonly Readonly<ServerToolCall>[],
  ) => string | undefined;
}

/**
 * Application label callbacks keyed by technical tool name.
 *
 * @public
 */
export type ServerToolCallLabelOverrides = Readonly<
  Record<string, ServerToolCallLabelOverride>
>;

/**
 * Consecutive successful calls presented as one display item.
 *
 * @public
 */
export interface ServerToolCallGroup {
  /** Discriminator for a grouped display item. */
  readonly kind: 'group';
  /** The shared technical tool name. */
  readonly name: string;
  /** Human-readable wording bounded to 120 Unicode code points. */
  readonly label: string;
  /** Original calls, in input order. */
  readonly calls: readonly Readonly<ServerToolCall>[];
  /** Original sources, deduplicated by id in first-occurrence order. */
  readonly sources: readonly Readonly<ServerToolCallSource>[];
}

/**
 * An original call or a display group containing original calls.
 *
 * @public
 */
export type GroupedServerToolCall =
  Readonly<ServerToolCall> | ServerToolCallGroup;

/**
 * Application wording and tool names that must remain separate.
 *
 * @public
 */
export interface GroupServerToolCallsOptions {
  /** Application callbacks keyed by technical tool name. */
  readonly labels?: ServerToolCallLabelOverrides;
  /** Calls of these names break groups and remain individual items. */
  readonly exclude?: readonly string[];
}

const LABEL_MAX = 120;

function bounded(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const points = Array.from(trimmed);
  return points.length > LABEL_MAX
    ? `${points.slice(0, LABEL_MAX - 1).join('')}…`
    : trimmed;
}

function overrideFor(
  name: string,
  overrides?: ServerToolCallLabelOverrides,
): ServerToolCallLabelOverride | undefined {
  return overrides && Object.prototype.hasOwnProperty.call(overrides, name)
    ? overrides[name]
    : undefined;
}

function safelyLabel(
  callback: (() => unknown) | undefined,
): string | undefined {
  try {
    return bounded(callback?.());
  } catch {
    return undefined;
  }
}

/**
 * Resolves application, producer, then lifecycle wording without exposing args
 * or results. All returned labels are trimmed and bounded to 120 code points.
 *
 * @param call - The original public call to display.
 * @param overrides - Application callbacks keyed by technical tool name.
 * @returns The resolved label.
 * @public
 */
export function getServerToolCallLabel(
  call: Readonly<ServerToolCall>,
  overrides?: ServerToolCallLabelOverrides,
): string {
  const override = overrideFor(call.name, overrides);
  const custom = safelyLabel(
    override?.label ? () => override.label?.(call) : undefined,
  );
  const producer = bounded(call.label);
  if (custom !== undefined) return custom;
  if (producer !== undefined) return producer;
  const outcome =
    call.outcome ??
    (call.result?.status === 'rejected' || call.error !== undefined
      ? 'failure'
      : 'success');
  const generic =
    call.status !== 'complete'
      ? `Using ${call.name}…`
      : outcome === 'failure'
        ? `${call.name} failed`
        : outcome === 'denied'
          ? `Denied ${call.name}`
          : outcome === 'cancelled'
            ? `Cancelled ${call.name}`
            : outcome === 'interrupted'
              ? `Interrupted ${call.name}`
              : outcome === 'retried'
                ? `Retry requested for ${call.name}`
                : `Used ${call.name}`;
  return bounded(generic) as string;
}

function canGroup(
  call: Readonly<ServerToolCall>,
  exclude?: readonly string[],
): boolean {
  return (
    call.status === 'complete' &&
    (call.outcome === undefined || call.outcome === 'success') &&
    call.result?.status !== 'rejected' &&
    call.error === undefined &&
    !exclude?.includes(call.name)
  );
}

function sameIdentity(
  left: Readonly<ServerToolCall>,
  right: Readonly<ServerToolCall>,
): boolean {
  const leftProvider = readRawStepIdentity(
    left.metadata?.[ɵTOOL_STEP_METADATA_KEY],
  ).provider;
  const rightProvider = readRawStepIdentity(
    right.metadata?.[ɵTOOL_STEP_METADATA_KEY],
  ).provider;
  return (
    left.subagentRunId === right.subagentRunId &&
    left.resultSubagentRunId === right.resultSubagentRunId &&
    left.name === right.name &&
    left.kind === right.kind &&
    left.builtin === right.builtin &&
    leftProvider === rightProvider &&
    left.parentToolCallId === right.parentToolCallId
  );
}

function commonPhrase(labels: readonly string[]): string | undefined {
  const words = labels.map((label) =>
    label
      .replace(/\s*\([^()]*\)\s*$/, '')
      .trim()
      .split(/\s+/),
  );
  const first = words[0];
  let prefixLength = 0;
  while (
    prefixLength < first.length &&
    words.every((parts) => parts[prefixLength] === first[prefixLength])
  )
    prefixLength++;
  if (prefixLength === 0) return undefined;
  const subjects = words.map((parts) => parts.slice(prefixLength).join(' '));
  if (
    subjects.some(
      (subject) =>
        !subject ||
        subject.split(/\s+/).length > 4 ||
        Array.from(subject).length > 32 ||
        /[,;:]|…|\.\.\.$/.test(subject),
    )
  )
    return undefined;
  if (new Set(subjects).size !== subjects.length) return undefined;
  const tail =
    subjects.length > 3
      ? `${subjects[0]}, ${subjects[1]} and ${subjects.length - 2} more`
      : `${subjects.slice(0, -1).join(', ')} and ${subjects[subjects.length - 1]}`;
  return `${first.slice(0, prefixLength).join(' ')} ${tail}`;
}

function makeGroup(
  calls: readonly Readonly<ServerToolCall>[],
  labels?: ServerToolCallLabelOverrides,
): ServerToolCallGroup {
  const name = calls[0].name;
  const override = overrideFor(name, labels);
  const custom = safelyLabel(
    override?.group ? () => override.group?.(calls) : undefined,
  );
  const phrase = commonPhrase(
    calls.map((call) => getServerToolCallLabel(call, labels)),
  );
  const sources = new Map<string, Readonly<ServerToolCallSource>>();
  for (const call of calls) {
    for (const source of call.sources ?? []) {
      if (!sources.has(source.id)) sources.set(source.id, source);
    }
  }
  return {
    kind: 'group',
    name,
    label:
      custom ??
      bounded(phrase) ??
      (bounded(`Used ${name} ${calls.length} times`) as string),
    calls,
    sources: Array.from(sources.values()),
  };
}

/**
 * Groups adjacent successful complete calls with identical tool identities.
 * Open, unsuccessful and excluded calls remain separate and break groups.
 * Inputs and their member/source objects are preserved without mutation.
 *
 * @param calls - Public server calls in display order.
 * @param options - Application wording and excluded technical tool names.
 * @returns Original calls or groups, in display order.
 * @public
 */
export function groupServerToolCalls(
  calls: readonly Readonly<ServerToolCall>[],
  options?: GroupServerToolCallsOptions,
): readonly GroupedServerToolCall[] {
  const result: GroupedServerToolCall[] = [];
  let index = 0;
  while (index < calls.length) {
    const first = calls[index];
    let end = index + 1;
    if (canGroup(first, options?.exclude)) {
      while (
        end < calls.length &&
        canGroup(calls[end], options?.exclude) &&
        sameIdentity(first, calls[end])
      )
        end++;
    }
    result.push(
      end - index > 1
        ? makeGroup(calls.slice(index, end), options?.labels)
        : first,
    );
    index = end;
  }
  return result;
}
