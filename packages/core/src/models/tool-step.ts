/**
 * The shared `b4.step` tool-step contract (v1), read and merged without any
 * dependency on B4. Every function is pure and returns fresh objects.
 */

/** Metadata key that carries a {@link ɵToolStep} on a tool call or message. */
export const ɵTOOL_STEP_METADATA_KEY = 'b4.step';

/** Metadata key that carries {@link ɵAnswerAnnotations} on an assistant message. */
export const ɵANSWER_METADATA_KEY = 'b4.answer';

/** Name of the AG-UI CUSTOM event that carries a live {@link ɵToolStep}. */
export const ɵTOOL_STEP_EVENT_NAME = 'b4.step';

const LABEL_MAX = 120;
const STATUSES = ['running', 'completed', 'failed', 'denied', 'cancelled'];
const SOURCE_KINDS = ['url', 'file', 'document', 'record'];
const DECISIONS = ['once', 'always', 'deny'];

type Metadata = Readonly<Record<string, unknown>>;

/** A source produced by a tool call, referenced by citations through its id. */
export interface ɵToolStepSource {
  id: string;
  kind: 'url' | 'file' | 'document' | 'record';
  title: string;
  href?: string;
  snippet?: string;
  fileId?: string;
  containerId?: string;
  cited?: boolean;
}

/** The lifecycle status of a tool step. */
export type ɵToolStepStatus =
  'running' | 'completed' | 'failed' | 'denied' | 'cancelled';

/** A complete v1 tool step. */
export interface ɵToolStep {
  v: 1;
  toolCallId?: string;
  kind: 'server' | 'provider';
  builtin?: string;
  provider?: string;
  status: ɵToolStepStatus;
  label?: string;
  icon?: string;
  queries?: string[];
  sources?: ɵToolStepSource[];
  startedAt?: number;
  settledAt?: number;
  parentToolCallId?: string;
  error?: { message: string; code?: string };
  decision?: 'once' | 'always' | 'deny';
}

/**
 * A step as read from the wire: the same as {@link ɵToolStep} except that
 * `status` is absent when the producer sent none or an unknown one. A read
 * without a status never changes the status of the step it merges into.
 */
export type ɵToolStepRead = Omit<ɵToolStep, 'status'> & {
  status?: ɵToolStepStatus;
};

/** Citations, call-less sources and attribution carried on an answer. */
export interface ɵAnswerAnnotations {
  v: 1;
  citations?: Array<{
    sourceId: string;
    quote?: string;
    block?: number;
    start?: number;
    end?: number;
  }>;
  sources?: ɵToolStepSource[];
  attribution?: Array<{
    provider: 'google';
    kind: 'search-suggestions' | 'maps';
    html?: string;
    widgetToken?: string;
    mustRender: true;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function time(value: unknown): number | undefined {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return num(value);
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function readSource(
  value: unknown,
  fallbackId: string,
): ɵToolStepSource | undefined {
  if (!isRecord(value)) return undefined;
  const title = str(value['title']);
  if (title === undefined) return undefined;
  const href = str(value['href']);
  const kind = SOURCE_KINDS.includes(value['kind'] as string)
    ? (value['kind'] as ɵToolStepSource['kind'])
    : href !== undefined
      ? 'url'
      : 'record';
  return compact({
    id: str(value['id']) ?? fallbackId,
    kind,
    title,
    href,
    snippet: str(value['snippet']),
    fileId: str(value['fileId']),
    containerId: str(value['containerId']),
    cited: typeof value['cited'] === 'boolean' ? value['cited'] : undefined,
  });
}

function readSources(
  value: unknown,
  idPrefix: string,
): ɵToolStepSource[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((entry, index) => readSource(entry, `${idPrefix}:${index}`))
    .filter((entry): entry is ɵToolStepSource => entry !== undefined);
}

/**
 * Reads a `b4.step` value, whether v1 or legacy, into a normalized step.
 * A legacy value gets `v: 1`, `kind: 'server'`, source ids of the form
 * `<toolCallId>:<index>` and epoch-millisecond times. Labels are cut to 120
 * code points and an unknown status reads as an undefined status.
 *
 * @param value - The raw metadata or event value.
 * @param toolCallId - The call id to use when the value carries none.
 * @returns The step, or `undefined` when the value is not a v1 or legacy step.
 */
export function ɵreadToolStep(
  value: unknown,
  toolCallId?: string,
): ɵToolStepRead | undefined {
  if (!isRecord(value)) return undefined;
  if (value['v'] !== undefined && value['v'] !== 1) return undefined;
  const id = str(value['toolCallId']) ?? toolCallId;
  const label = str(value['label']);
  const error = isRecord(value['error'])
    ? str(value['error']['message']) !== undefined
      ? compact({
          message: value['error']['message'] as string,
          code: str(value['error']['code']),
        })
      : undefined
    : undefined;
  return compact({
    v: 1 as const,
    toolCallId: id,
    kind:
      value['kind'] === 'provider'
        ? ('provider' as const)
        : ('server' as const),
    builtin: str(value['builtin']),
    provider: str(value['provider']),
    status: STATUSES.includes(value['status'] as string)
      ? (value['status'] as ɵToolStepStatus)
      : undefined,
    label:
      label === undefined
        ? undefined
        : Array.from(label).slice(0, LABEL_MAX).join(''),
    icon: str(value['icon']),
    queries: Array.isArray(value['queries'])
      ? value['queries'].filter((q): q is string => typeof q === 'string')
      : undefined,
    sources: readSources(value['sources'], id ?? ''),
    startedAt: time(value['startedAt']),
    settledAt: time(value['settledAt']),
    parentToolCallId: str(value['parentToolCallId']),
    error,
    decision: DECISIONS.includes(value['decision'] as string)
      ? (value['decision'] as ɵToolStep['decision'])
      : undefined,
  });
}

/**
 * Reads a `b4.answer` value into answer annotations.
 *
 * @param value - The raw metadata value.
 * @returns The annotations, or `undefined` when the value is not a v1 object.
 */
export function ɵreadAnswerAnnotations(
  value: unknown,
): ɵAnswerAnnotations | undefined {
  if (!isRecord(value)) return undefined;
  if (value['v'] !== undefined && value['v'] !== 1) return undefined;
  const citations = Array.isArray(value['citations'])
    ? value['citations']
        .filter(isRecord)
        .filter((c) => str(c['sourceId']) !== undefined)
        .map((c) =>
          compact({
            sourceId: c['sourceId'] as string,
            quote: str(c['quote']),
            block: num(c['block']),
            start: num(c['start']),
            end: num(c['end']),
          }),
        )
    : undefined;
  const attribution = Array.isArray(value['attribution'])
    ? value['attribution']
        .filter(isRecord)
        .filter(
          (a) =>
            a['provider'] === 'google' &&
            (a['kind'] === 'search-suggestions' || a['kind'] === 'maps'),
        )
        .map((a) =>
          compact({
            provider: 'google' as const,
            kind: a['kind'] as 'search-suggestions' | 'maps',
            html: str(a['html']),
            widgetToken: str(a['widgetToken']),
            mustRender: true as const,
          }),
        )
    : undefined;
  return compact({
    v: 1 as const,
    citations,
    sources: readSources(value['sources'], 'answer'),
    attribution,
  });
}

const BAD = ['failed', 'denied', 'cancelled'];

/**
 * Merges a step into the one already held for a call.
 *
 * `failed` wins over every status. `completed`, `denied` and `cancelled`
 * settle the step unless it has failed. `running` only lifts an unsettled
 * step, and a read without a status keeps the current one. When both sides
 * are settled, a step from a message beats one from a call: a settled step
 * changes status only for a message write, or for a call write that moves
 * `completed` into `denied` or `cancelled`. A settle out of `running`, or a
 * move into a different bad settle, drops the running-only `label` and
 * `sources` unless the incoming step restates them; `icon`, `startedAt`,
 * `queries`, `kind`, `builtin` and `provider` carry over. A `running` write
 * never contributes fields to a settled step. Otherwise the incoming step's
 * defined fields overlay the held ones, except that a call write onto a
 * settled step only fills fields the step lacks. A failed step with no error
 * gets a default one. Mirrors B4's `mergeToolStep`.
 *
 * @param previous - The step held so far, if any.
 * @param next - The incoming step.
 * @param source - Whether the incoming step came from a call or a message.
 * @returns The merged step; the inputs are not modified.
 */
export function ɵmergeToolStep(
  previous: ɵToolStep | undefined,
  next: ɵToolStepRead,
  source: 'call' | 'message',
): ɵToolStep {
  return withDefaultError(mergeSteps(previous, next, source));
}

function withDefaultError(step: ɵToolStep): ɵToolStep {
  return step.status === 'failed' && step.error === undefined
    ? { ...step, error: { message: 'Tool call did not finish' } }
    : step;
}

function mergeSteps(
  previous: ɵToolStep | undefined,
  next: ɵToolStepRead,
  source: 'call' | 'message',
): ɵToolStep {
  if (previous === undefined) {
    return { ...next, status: next.status ?? 'running' };
  }
  if (previous.status === 'failed') return { ...previous };
  const prevSettled = previous.status !== 'running';
  const { status: nextStatus, ...rest } = next;
  const nextFields = compact(rest);
  // A running write says nothing about a step that has already settled.
  if (prevSettled && nextStatus === 'running') return { ...previous };
  let status: ɵToolStepStatus = previous.status;
  if (nextStatus === 'failed') status = 'failed';
  else if (nextStatus === 'running') status = 'running';
  else if (nextStatus !== undefined) {
    const badAfterCompleted =
      previous.status === 'completed' && BAD.includes(nextStatus);
    if (source === 'message' || !prevSettled || badAfterCompleted) {
      status = nextStatus;
    }
  }
  const settlesRunning = previous.status === 'running' && status !== 'running';
  const turnsBad = BAD.includes(status) && status !== previous.status;
  if (settlesRunning || turnsBad) {
    return { ...withoutRunningFields(previous), ...nextFields, status };
  }
  return source === 'message' || !prevSettled
    ? { ...previous, ...nextFields, status }
    : { ...nextFields, ...previous, status };
}

/** The step without its running-only `label` and `sources`. */
function withoutRunningFields(step: ɵToolStep): ɵToolStep {
  return Object.fromEntries(
    Object.entries(step).filter(
      ([key]) => key !== 'label' && key !== 'sources',
    ),
  ) as unknown as ɵToolStep;
}

/**
 * A shallow metadata merge, like a plain spread, except that the `b4.step`
 * key goes through {@link ɵmergeToolStep}. An unreadable incoming step keeps
 * the previous step, or its own raw value when there is none; readers ignore
 * a raw value they cannot read.
 *
 * @param previous - Metadata held so far.
 * @param next - Incoming metadata.
 * @param source - Whether the incoming metadata came from a call or a message.
 * @returns The merged metadata, or `undefined` when both sides are absent.
 */
export function ɵmergeStepMetadata(
  previous: Metadata | undefined,
  next: Metadata | undefined,
  source: 'call' | 'message',
): Metadata | undefined {
  if (next === undefined) return previous;
  const merged: Record<string, unknown> = { ...previous, ...next };
  if (ɵTOOL_STEP_METADATA_KEY in next) {
    const rawNext = next[ɵTOOL_STEP_METADATA_KEY];
    const nextStep = ɵreadToolStep(rawNext);
    const previousStep = ɵreadToolStep(previous?.[ɵTOOL_STEP_METADATA_KEY]);
    const heldStep =
      previousStep === undefined
        ? undefined
        : { ...previousStep, status: previousStep.status ?? 'running' };
    if (nextStep === undefined) {
      if (previous !== undefined && ɵTOOL_STEP_METADATA_KEY in previous) {
        merged[ɵTOOL_STEP_METADATA_KEY] = previous[ɵTOOL_STEP_METADATA_KEY];
      }
    } else {
      const statedKind =
        isRecord(rawNext) &&
        (rawNext['kind'] === 'server' || rawNext['kind'] === 'provider');
      merged[ɵTOOL_STEP_METADATA_KEY] = ɵmergeToolStep(
        heldStep,
        heldStep !== undefined && !statedKind
          ? { ...nextStep, kind: heldStep.kind }
          : nextStep,
        source,
      );
    }
  }
  return merged;
}

/**
 * Settles every open (`running`) step at the end of a run: `failed` on a run
 * error, `cancelled` on a cancelled or interrupted run. Ids in `keepOpen`
 * stay running. A settled step loses its running label and sources, and a
 * failed one gets the default error. Mirrors B4's `settleOpenSteps`.
 *
 * Internal to core: not exported from the package.
 *
 * @param steps - Steps keyed by tool call id.
 * @param outcome - How the open steps settle.
 * @param keepOpen - Tool call ids that stay open.
 * @param at - The settle time, in epoch milliseconds.
 * @returns A new record; the input is not modified.
 */
export function settleOpenSteps(
  steps: Readonly<Record<string, ɵToolStep>>,
  outcome: 'failed' | 'cancelled',
  keepOpen: ReadonlySet<string>,
  at: number,
): Record<string, ɵToolStep> {
  return Object.fromEntries(
    Object.entries(steps).map(([id, step]) => {
      if (step.status !== 'running' || keepOpen.has(id)) return [id, step];
      return [
        id,
        compact({
          ...step,
          label: undefined,
          sources: undefined,
          status: outcome,
          settledAt: at,
          ...(outcome === 'failed'
            ? { error: { message: 'Tool call did not finish' } }
            : {}),
        }),
      ];
    }),
  );
}

/**
 * Gives a step with no `startedAt` the time of the event that folded it in,
 * so timing works without reading a clock. A step that has a `startedAt`, an
 * unreadable value or an event without a numeric timestamp is unchanged.
 *
 * Internal to core: not exported from the package.
 *
 * @param step - A raw or normalized step value.
 * @param timestamp - The folding event's `timestamp`, if any.
 * @returns The step, or a copy with `startedAt` set.
 */
export function stampStepStart<T>(step: T, timestamp: unknown): T {
  if (!isRecord(step) || num(timestamp) === undefined) return step;
  const read = ɵreadToolStep(step);
  if (read === undefined || read.startedAt !== undefined) return step;
  return { ...step, startedAt: timestamp } as T;
}

/**
 * Applies {@link stampStepStart} to the `b4.step` key of a call's metadata.
 *
 * Internal to core: not exported from the package.
 *
 * @param metadata - A tool call's metadata.
 * @param timestamp - The folding event's `timestamp`, if any.
 * @returns The metadata, or a copy with the step's `startedAt` set.
 */
export function stampStepMetadataStart(
  metadata: Metadata | undefined,
  timestamp: unknown,
): Metadata | undefined {
  const raw = metadata?.[ɵTOOL_STEP_METADATA_KEY];
  const stamped = stampStepStart(raw, timestamp);
  return stamped === raw
    ? metadata
    : { ...metadata, [ɵTOOL_STEP_METADATA_KEY]: stamped };
}

/**
 * Reopens a `cancelled` step when its call is started again, as a resume run
 * does for a call cancelled at an interrupt: status `running`, label and
 * `settledAt` cleared. Any other step, or none, is returned unchanged.
 *
 * Internal to core: not exported from the package.
 *
 * @param metadata - A tool call's metadata.
 * @returns The metadata, or a copy with the step reopened.
 */
export function reopenCancelledStep(
  metadata: Metadata | undefined,
): Metadata | undefined {
  const raw = metadata?.[ɵTOOL_STEP_METADATA_KEY];
  if (!isRecord(raw) || raw['status'] !== 'cancelled') return metadata;
  const { label: _label, settledAt: _settledAt, ...rest } = raw;
  return {
    ...metadata,
    [ɵTOOL_STEP_METADATA_KEY]: { ...rest, status: 'running' },
  };
}

/**
 * Whether a tool call's step says the model provider ran it. Such a call is
 * never executed by, or validated against, a client tool of the same name.
 *
 * Internal to core: not exported from the package.
 *
 * @param toolCall - Anything with the call's metadata.
 * @returns True for a `kind: 'provider'` step.
 */
export function isProviderToolCall(toolCall: {
  readonly metadata?: Metadata;
}): boolean {
  return (
    ɵreadToolStep(toolCall.metadata?.[ɵTOOL_STEP_METADATA_KEY])?.kind ===
    'provider'
  );
}

/**
 * Settles a `b4.step` once its call has a result. Without an error, a
 * still-`running` step becomes `completed` with the running label cleared
 * (sources kept). With an error, any step that has not failed becomes
 * `failed` with `error: {message}`, even one a call already settled, since
 * failed wins. A step that already failed keeps its own error, and a call
 * with no step is left as it is.
 *
 * Internal to core: not exported from the package.
 *
 * @param metadata - A tool call's merged metadata.
 * @param error - The result's error string, if it failed; an empty string
 *   is no failure.
 * @returns The metadata, or a copy with the step settled.
 */
export function completeRunningStep(
  metadata: Metadata | undefined,
  error?: string,
): Metadata | undefined {
  const raw = metadata?.[ɵTOOL_STEP_METADATA_KEY];
  if (!isRecord(raw)) return metadata;
  const step = ɵreadToolStep(raw);
  const failure = readResultFailure(error);
  const status = step?.status ?? 'running';
  if (
    step === undefined ||
    status === 'failed' ||
    (failure === undefined && status !== 'running')
  ) {
    return metadata;
  }
  return {
    ...metadata,
    [ɵTOOL_STEP_METADATA_KEY]:
      failure === undefined
        ? withoutLabel({ ...raw, status: 'completed' })
        : ɵmergeToolStep(
            { ...step, status },
            {
              v: 1,
              kind: step.kind,
              status: 'failed',
              error: { message: failure },
            },
            'message',
          ),
  };
}

function withoutLabel<T extends Record<string, unknown>>(step: T): T {
  const { label: _label, ...rest } = step;
  return rest as T;
}

/**
 * The step implied by a frame-only `TOOL_CALL_RESULT`: `completed`, or
 * `failed` with `error: {message}` when the result carried an error. A step
 * that first arrives after such a result merges onto this one.
 *
 * Internal to core: not exported from the package.
 *
 * @param error - The result's error string, if it failed; an empty string
 *   is no failure.
 * @returns A fresh frame-derived step.
 */
export function frameResultStep(error?: string): ɵToolStep {
  const failure = readResultFailure(error);
  return failure === undefined
    ? { v: 1, kind: 'server', status: 'completed' }
    : { v: 1, kind: 'server', status: 'failed', error: { message: failure } };
}

/**
 * Gives a call that has no step, but whose result already arrived, the step
 * that result implies (see {@link frameResultStep}), so a step arriving
 * afterwards merges onto it. A call with a readable step, or without a
 * result, is returned unchanged.
 *
 * Internal to core: not exported from the package.
 *
 * @param metadata - The call's merged metadata (call and result carriers).
 * @param result - The call's result, or `undefined` when it has none yet.
 * @returns The metadata, or a copy carrying the frame-derived step.
 */
export function seedFrameResultStep(
  metadata: Metadata | undefined,
  result: { readonly error?: string } | undefined,
): Metadata | undefined {
  if (result === undefined) return metadata;
  if (ɵreadToolStep(metadata?.[ɵTOOL_STEP_METADATA_KEY]) !== undefined) {
    return metadata;
  }
  return {
    ...metadata,
    [ɵTOOL_STEP_METADATA_KEY]: frameResultStep(result.error),
  };
}

/**
 * Reads the failure a tool result carries: a non-empty error string, or the
 * non-empty `message` of an `Error`-like rejection reason. An empty string is
 * no failure, as in B4's fold.
 *
 * Internal to core: not exported from the package.
 *
 * @param value - A RESULT `error` field or a rejection reason.
 * @returns The failure message, or `undefined` when there is none.
 */
export function readResultFailure(value: unknown): string | undefined {
  const message = isRecord(value) ? value['message'] : value;
  return typeof message === 'string' && message !== '' ? message : undefined;
}
