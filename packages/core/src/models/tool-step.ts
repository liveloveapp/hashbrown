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
 * are settled, a step from a message beats one from a call. A running step
 * that moves to a bad settle loses its label and sources unless the new step
 * supplies them. A failed step with no error gets a default one.
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
  let status: ɵToolStepStatus;
  if (next.status === undefined) status = previous.status;
  else if (next.status === 'failed') status = 'failed';
  else if (next.status === 'running') status = previous.status;
  else if (prevSettled && source === 'call') status = previous.status;
  else status = next.status;

  const defined = compact({ ...next }) as ɵToolStepRead;
  const merged: ɵToolStep = { ...previous, ...defined, status };
  if (previous.status === 'running' && BAD.includes(status)) {
    const { label, sources, ...rest } = merged;
    return {
      ...rest,
      status,
      ...(next.label !== undefined ? { label } : {}),
      ...(next.sources !== undefined ? { sources } : {}),
    };
  }
  return merged;
}

/**
 * A shallow metadata merge, like a plain spread, except that the `b4.step`
 * key goes through {@link ɵmergeToolStep}.
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
      } else {
        delete merged[ɵTOOL_STEP_METADATA_KEY];
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
 * Settles a still-`running` `b4.step` once its call has a result: `completed`
 * with the label kept, or `failed` with `error: {message}` when the result
 * carries an error. Any other step, or none, is left as it is.
 *
 * Internal to core: not exported from the package.
 *
 * @param metadata - A tool call's merged metadata.
 * @param error - The result's error string, if it failed.
 * @returns The metadata, or a copy with the step settled.
 */
export function completeRunningStep(
  metadata: Metadata | undefined,
  error?: string,
): Metadata | undefined {
  const raw = metadata?.[ɵTOOL_STEP_METADATA_KEY];
  if (!isRecord(raw)) return metadata;
  const step = ɵreadToolStep(raw);
  if (step === undefined || (step.status ?? 'running') !== 'running') {
    return metadata;
  }
  return {
    ...metadata,
    [ɵTOOL_STEP_METADATA_KEY]:
      error === undefined
        ? { ...raw, status: 'completed' }
        : ɵmergeToolStep(
            { ...step, status: 'running' },
            {
              v: 1,
              kind: step.kind,
              status: 'failed',
              error: { message: error },
            },
            'message',
          ),
  };
}
