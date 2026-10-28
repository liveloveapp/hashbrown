import { type AGUIEvent, type Message } from '@ag-ui/core';
import { ɵownAgUiJsonValue } from './ag-ui-json-value';
import { type JsonValue } from '../utils/types';
import { type SubagentRun } from '../models/subagent-run';

/** Owner of a native event; undefined denotes the enclosing agent. @internal */
type Owner = string | undefined;
/** A chunk stream awaiting its implicit end. @internal */
interface Pending {
  readonly kind: string;
  readonly id: string;
  readonly fields: Readonly<Record<string, unknown>>;
}
/** Owner-local arrival context. @internal */
export interface ɵAgUiSubagentLane {
  readonly assistantMessageId?: string;
  readonly toolCallId?: string;
  readonly pending?: Pending;
  readonly explicit?: ReadonlyMap<string, Pending>;
}
/** Independent native identity buckets. @internal */
export interface ɵAgUiSubagentOwners {
  readonly message: ReadonlyMap<string, Owner>;
  readonly reasoning: ReadonlyMap<string, Owner>;
  readonly tool: ReadonlyMap<string, Owner>;
  readonly activity: ReadonlyMap<string, Owner>;
}
/** Transactional native ownership and lifecycle validation state. @internal */
export interface ɵAgUiSubagentsState {
  readonly records: readonly SubagentRun[];
  readonly owners: ɵAgUiSubagentOwners;
  /** Stored native tool identity, independent of active stream correlation. */
  readonly toolIdentities: ReadonlyMap<
    string,
    Readonly<Record<string, string>>
  >;
  readonly lanes: ReadonlyMap<Owner, ɵAgUiSubagentLane>;
  readonly announced: ReadonlySet<string>;
  readonly active: ReadonlySet<string>;
  readonly closed: ReadonlySet<string>;
  readonly steps: ReadonlyMap<Owner, ReadonlySet<string>>;
  readonly runId?: string;
}
/** Seeds native ownership from canonical history. @internal */
export function ɵcreateAgUiSubagentsState(
  history: readonly Message[] = [],
  records: readonly SubagentRun[] = [],
): ɵAgUiSubagentsState {
  const initial: ɵAgUiSubagentsState = {
    records,
    toolIdentities: new Map(),
    owners: {
      message: new Map(),
      reasoning: new Map(),
      tool: new Map(),
      activity: new Map(),
    },
    lanes: new Map(),
    announced: new Set(),
    active: new Set(),
    closed: new Set(),
    steps: new Map(),
  };
  return seedHistory(initial, history);
}

/** Validates and normalizes one event without mutating its input state. @internal */
export function ɵfoldAgUiSubagents(
  state: ɵAgUiSubagentsState,
  input: AGUIEvent,
): {
  readonly state: ɵAgUiSubagentsState;
  readonly events: readonly AGUIEvent[];
} {
  let event = input as unknown as Record<string, unknown>;
  const type = event['type'] as string;
  const lifecycle = [
    'SUBAGENT_STARTED',
    'SUBAGENT_FINISHED',
    'SUBAGENT_ERROR',
  ].includes(type);
  if (event['subagentRunId'] === null && !lifecycle) {
    const { subagentRunId, ...rest } = event;
    void subagentRunId;
    event = rest;
  }
  stringField(event, 'subagentRunId', lifecycle);
  const tag = event['subagentRunId'] as Owner;
  const owners = {
    message: new Map(state.owners.message),
    reasoning: new Map(state.owners.reasoning),
    tool: new Map(state.owners.tool),
    activity: new Map(state.owners.activity),
  };
  const lanes = new Map(state.lanes);
  const toolIdentities = new Map(state.toolIdentities);
  const steps = new Map(state.steps);
  let records = state.records;
  let announced = state.announced;
  let active = state.active;
  let closed = state.closed;
  let runId = state.runId;
  const events: AGUIEvent[] = [];

  /** Records an attributed owner without inventing lifecycle facts. */
  function observe(owner: Owner) {
    if (
      owner !== undefined &&
      !records.some((record) => record.subagentRunId === owner)
    ) {
      records = [
        ...records,
        Object.freeze({
          subagentRunId: owner,
          status: 'unknown' as const,
          interruptIds: Object.freeze([]),
        }),
      ];
    }
  }
  /** Replaces one owner-local context. */
  function context(owner: Owner, patch: Partial<ɵAgUiSubagentLane>) {
    const previous = lanes.get(owner) ?? {};
    const next = { ...previous, ...patch };
    if (!sameObject(previous, next)) lanes.set(owner, next);
  }
  /** Ends one synthesized chunk stream, preserving explicit streams. */
  function close(owner: Owner) {
    const pending = lanes.get(owner)?.pending;
    if (!pending) return;
    const endType =
      pending.kind === 'tool'
        ? 'TOOL_CALL_END'
        : pending.kind === 'reasoning'
          ? 'REASONING_MESSAGE_END'
          : 'TEXT_MESSAGE_END';
    events.push({
      type: endType,
      [pending.kind === 'tool' ? 'toolCallId' : 'messageId']: pending.id,
      ...(owner !== undefined ? { subagentRunId: owner } : {}),
    } as AGUIEvent);
    context(owner, { pending: undefined });
  }
  /** Associates an ID, inheriting its established owner for absent tags. */
  function associate(
    bucket: Map<string, Owner>,
    id: string,
    proposed: Owner,
    replace = false,
  ): Owner {
    if (!replace && bucket.has(id)) {
      const existing = bucket.get(id);
      if (proposed !== undefined && proposed !== existing)
        throw new Error(`Conflicting owner for '${id}'.`);
      return existing;
    }
    bucket.set(id, proposed);
    return proposed;
  }
  /** Materializes inferred attribution on the original event. */
  function attribute(owner: Owner) {
    if (owner !== undefined && event['subagentRunId'] !== owner)
      event = { ...event, subagentRunId: owner };
    observe(owner);
  }

  if (lifecycle) {
    const id = tag as string;
    if (type === 'SUBAGENT_STARTED') {
      stringField(event, 'name', true);
      for (const field of [
        'description',
        'parentSubagentRunId',
        'parentToolCallId',
        'parentMessageId',
      ])
        stringField(event, field);
      if (announced.has(id))
        throw new Error(`Subagent '${id}' already started in this run.`);
      if (
        event['parentSubagentRunId'] !== undefined &&
        !announced.has(event['parentSubagentRunId'] as string)
      )
        throw new Error('Parent subagent must have started in this run.');
      announced = new Set([...announced, id]);
      active = new Set([...active, id]);
      const previous = records.find((record) => record.subagentRunId === id);
      const startedAt = finiteTimestamp(event['timestamp']);
      const next: SubagentRun = Object.freeze({
        subagentRunId: id,
        name: event['name'] as string,
        ...optionalStrings(event, [
          'description',
          'parentSubagentRunId',
          'parentToolCallId',
          'parentMessageId',
        ]),
        ...(runId !== undefined ? { runId } : {}),
        status: 'running',
        interruptIds: Object.freeze([]),
        ...(startedAt !== undefined
          ? { timing: Object.freeze({ startedAt }) }
          : previous?.timing?.startedAt !== undefined
            ? {
                timing: Object.freeze({ startedAt: previous.timing.startedAt }),
              }
            : {}),
      });
      records = replaceRecord(records, next);
    } else if (type === 'SUBAGENT_FINISHED' || type === 'SUBAGENT_ERROR') {
      if (!active.has(id)) throw new Error(`No active subagent '${id}'.`);
      const previous = records.find(
        (record) => record.subagentRunId === id,
      ) as SubagentRun;
      let status: SubagentRun['status'] = 'complete';
      let interruptIds: readonly string[] = Object.freeze([]);
      if (type === 'SUBAGENT_ERROR') {
        stringField(event, 'message', true);
        stringField(event, 'code');
        status = 'failed';
      } else if (event['outcome'] !== undefined) {
        const outcome = event['outcome'] as Record<string, unknown> | null;
        if (
          !outcome ||
          typeof outcome !== 'object' ||
          !['success', 'suspended'].includes(outcome['type'] as string)
        )
          throw new Error('Invalid subagent outcome.');
        if (
          outcome['interruptIds'] !== undefined &&
          (!Array.isArray(outcome['interruptIds']) ||
            !outcome['interruptIds'].every((id) => typeof id === 'string'))
        )
          throw new Error('Invalid interrupt IDs.');
        if (outcome['type'] === 'suspended') {
          status = 'awaiting';
          interruptIds = Object.freeze([
            ...((outcome['interruptIds'] as string[] | undefined) ?? []),
          ]);
        }
      }
      const settledAt = finiteTimestamp(event['timestamp']);
      const next = Object.freeze({
        ...previous,
        status,
        interruptIds,
        ...(settledAt !== undefined
          ? { timing: Object.freeze({ ...previous.timing, settledAt }) }
          : {}),
        ...(event['result'] !== undefined
          ? {
              result: ɵownAgUiJsonValue(event['result']) as Readonly<JsonValue>,
            }
          : {}),
        ...(type === 'SUBAGENT_ERROR'
          ? {
              error: Object.freeze({
                message: event['message'] as string,
                ...optionalStrings(event, ['code']),
              }),
            }
          : {}),
      });
      records = replaceRecord(records, next);
      active = new Set([...active].filter((owner) => owner !== id));
      closed = new Set([...closed, id]);
      close(id);
    } else throw new Error(`Unknown subagent lifecycle '${type}'.`);
  } else if (type === 'RUN_STARTED') {
    for (const owner of lanes.keys()) close(owner);
    lanes.clear();
    steps.clear();
    announced = new Set();
    active = new Set();
    closed = new Set();
    stringField(event, 'runId');
    runId = event['runId'] as string | undefined;
  } else if (
    type === 'RUN_FINISHED' ||
    type === 'RUN_ERROR' ||
    type === 'MESSAGES_SNAPSHOT'
  ) {
    if (type === 'RUN_FINISHED' && active.size)
      throw new Error('Cannot finish a run with active subagents.');
    for (const owner of lanes.keys()) close(owner);
    if (type === 'MESSAGES_SNAPSHOT') lanes.clear();
  } else if (
    type.endsWith('_CHUNK') &&
    [
      'TEXT_MESSAGE_CHUNK',
      'TOOL_CALL_CHUNK',
      'REASONING_MESSAGE_CHUNK',
    ].includes(type)
  ) {
    const kind =
      type === 'TOOL_CALL_CHUNK'
        ? 'tool'
        : type === 'REASONING_MESSAGE_CHUNK'
          ? 'reasoning'
          : 'text';
    const bucket =
      kind === 'tool'
        ? owners.tool
        : kind === 'reasoning'
          ? owners.reasoning
          : owners.message;
    const idField = kind === 'tool' ? 'toolCallId' : 'messageId';
    stringField(event, idField);
    for (const field of kind === 'tool'
      ? ['toolCallName', 'parentMessageId']
      : ['role', 'name'])
      stringField(event, field);
    let id = event[idField] as string | undefined;
    let owner = tag;
    if (id !== undefined && bucket.has(id)) owner = associate(bucket, id, tag);
    else if (
      kind === 'tool' &&
      event['parentMessageId'] !== undefined &&
      owners.message.has(event['parentMessageId'] as string)
    ) {
      const inherited = owners.message.get(event['parentMessageId'] as string);
      if (tag !== undefined && tag !== inherited)
        throw new Error('Tool owner conflicts with parent.');
      owner = inherited;
    } else if (id === undefined && tag === undefined) {
      if (
        lanes.get(undefined)?.pending?.kind !== kind &&
        !lanes.get(undefined)?.explicit?.has(kind)
      ) {
        const compatible = [...lanes].filter(
          ([, lane]) => lane.pending?.kind === kind || lane.explicit?.has(kind),
        );
        if (compatible.length > 1) throw new Error('Ambiguous chunk owner.');
        if (compatible.length === 1) owner = compatible[0][0];
      }
    }
    if (
      kind === 'tool' &&
      typeof event['parentMessageId'] === 'string' &&
      owners.message.has(event['parentMessageId'])
    ) {
      const inherited = owners.message.get(event['parentMessageId']);
      if (owner !== inherited)
        throw new Error('Tool owner conflicts with parent.');
    }
    const explicit = lanes.get(owner)?.explicit?.get(kind);
    const pending =
      id !== undefined && explicit?.id === id
        ? explicit
        : lanes.get(owner)?.pending?.kind === kind
          ? lanes.get(owner)?.pending
          : explicit;
    const continuation =
      pending?.kind === kind && (id === undefined || id === pending.id);
    if (continuation) {
      id = pending.id;
      for (const field of kind === 'tool'
        ? ['toolCallName', 'parentMessageId']
        : ['role', 'name']) {
        if (
          event[field] !== undefined &&
          event[field] !== pending.fields[field]
        )
          throw new Error(`Conflicting chunk ${field}.`);
      }
      event = { ...pending.fields, ...event, [idField]: id };
    } else {
      if (id === undefined)
        throw new Error(`First ${type} must have ${idField}.`);
      if (kind === 'tool') {
        const identity = toolIdentities.get(id);
        if (identity) {
          for (const field of ['toolCallName', 'parentMessageId']) {
            if (event[field] !== undefined && event[field] !== identity[field])
              throw new Error(`Conflicting chunk ${field}.`);
          }
        }
        event = { ...identity, ...event };
        stringField(event, 'toolCallName', true);
        const parentMessageId =
          (event['parentMessageId'] as string | undefined) ??
          lanes.get(owner)?.assistantMessageId ??
          `assistant-${id}`;
        event = { ...event, parentMessageId };
        associate(owners.message, parentMessageId, owner);
        toolIdentities.set(
          id,
          Object.freeze(
            optionalStrings(event, ['toolCallName', 'parentMessageId']),
          ),
        );
      } else if (kind === 'text' && event['role'] === undefined)
        event = { ...event, role: 'assistant' };
      close(owner);
      associate(bucket, id, owner);
      context(owner, {
        pending: {
          kind,
          id,
          fields: optionalStrings(
            event,
            kind === 'tool'
              ? ['toolCallName', 'parentMessageId']
              : ['role', 'name'],
          ),
        },
      });
      if (kind === 'text' && event['role'] === 'assistant')
        context(owner, { assistantMessageId: id });
      if (kind === 'tool')
        context(owner, {
          toolCallId: id,
          assistantMessageId: event['parentMessageId'] as string,
        });
    }
    attribute(owner);
  } else {
    let owner = tag;
    const isText = type.startsWith('TEXT_MESSAGE_');
    const isReasoning =
      type.startsWith('REASONING_MESSAGE_') ||
      type === 'REASONING_ENCRYPTED_VALUE' ||
      type === 'REASONING_START' ||
      type === 'REASONING_END';
    const isTool = type.startsWith('TOOL_CALL_') && type !== 'TOOL_CALL_RESULT';
    const isActivity = type.startsWith('ACTIVITY_');
    const result = type === 'TOOL_CALL_RESULT';
    const encrypted = type === 'REASONING_ENCRYPTED_VALUE';
    const encryptedId = event['entityId'] as string;
    const bucket = encrypted
      ? event['subtype'] === 'tool-call'
        ? owners.tool
        : owners.message.has(encryptedId)
          ? owners.message
          : owners.reasoning
      : isTool
        ? owners.tool
        : isReasoning
          ? owners.reasoning
          : isActivity
            ? owners.activity
            : owners.message;
    const id =
      event[encrypted ? 'entityId' : isTool ? 'toolCallId' : 'messageId'];
    if (
      (isText || isReasoning || isTool || isActivity || result) &&
      typeof id === 'string'
    ) {
      if (
        type === 'ACTIVITY_SNAPSHOT' &&
        event['replace'] === false &&
        bucket.has(id)
      )
        owner = bucket.get(id);
      else {
        if (type === 'TOOL_CALL_START') {
          if (bucket.has(id)) owner = associate(bucket, id, owner);
          const parentId =
            (event['parentMessageId'] as string | undefined) ??
            lanes.get(owner)?.assistantMessageId ??
            `assistant-${id}`;
          if (owners.message.has(parentId)) {
            const inherited = owners.message.get(parentId);
            if (tag !== undefined && tag !== inherited)
              throw new Error('Tool owner conflicts with parent.');
            if (bucket.has(id) && bucket.get(id) !== inherited)
              throw new Error(
                'Tool owner conflicts with its established parent.',
              );
            owner = inherited;
          }
          event = { ...event, parentMessageId: parentId };
          associate(owners.message, parentId, owner);
          toolIdentities.set(
            id,
            Object.freeze(
              optionalStrings(event, ['toolCallName', 'parentMessageId']),
            ),
          );
        }
        owner = associate(
          bucket,
          id,
          owner,
          type === 'ACTIVITY_SNAPSHOT' || result,
        );
      }
      if (
        type === 'TEXT_MESSAGE_START' &&
        (event['role'] === undefined || event['role'] === 'assistant')
      )
        context(owner, { assistantMessageId: id });
      if (type === 'TOOL_CALL_START')
        context(owner, {
          toolCallId: id,
          assistantMessageId: event['parentMessageId'] as string,
        });
    }
    attribute(owner);
    if (type === 'STEP_STARTED' || type === 'STEP_FINISHED') {
      stringField(event, 'stepName', true);
      const name = event['stepName'] as string;
      const previous = steps.get(owner) ?? new Set<string>();
      if (type === 'STEP_STARTED' ? previous.has(name) : !previous.has(name))
        throw new Error(`Invalid ${type} for owner-local step '${name}'.`);
      const next = new Set(previous);
      if (type === 'STEP_STARTED') next.add(name);
      else next.delete(name);
      steps.set(owner, next);
    }
    if (
      ![
        'RAW',
        'ACTIVITY_SNAPSHOT',
        'ACTIVITY_DELTA',
        'REASONING_ENCRYPTED_VALUE',
      ].includes(type)
    )
      close(owner);
    if (
      (isText || isTool || isReasoning) &&
      !encrypted &&
      typeof id === 'string'
    ) {
      const kind = isTool ? 'tool' : isReasoning ? 'reasoning' : 'text';
      if (type.endsWith('_START') && type !== 'REASONING_START') {
        const fields = optionalStrings(
          event,
          kind === 'tool'
            ? ['toolCallName', 'parentMessageId']
            : ['role', 'name'],
        );
        if (kind === 'text' && fields['role'] === undefined)
          fields['role'] = 'assistant';
        context(owner, {
          explicit: new Map(lanes.get(owner)?.explicit).set(kind, {
            kind,
            id,
            fields,
          }),
        });
      } else if (
        type.endsWith('_END') &&
        type !== 'REASONING_END' &&
        lanes.get(owner)?.explicit?.get(kind)?.id === id
      ) {
        const explicit = new Map(lanes.get(owner)?.explicit);
        explicit.delete(kind);
        context(owner, { explicit });
      }
    }
  }
  observe(tag);
  let next: ɵAgUiSubagentsState = {
    records,
    toolIdentities: reuseMap(state.toolIdentities, toolIdentities),
    owners: {
      message: reuseMap(state.owners.message, owners.message),
      reasoning: reuseMap(state.owners.reasoning, owners.reasoning),
      tool: reuseMap(state.owners.tool, owners.tool),
      activity: reuseMap(state.owners.activity, owners.activity),
    },
    lanes: reuseMap(state.lanes, lanes),
    steps: reuseMap(state.steps, steps),
    announced,
    active,
    closed,
    ...(runId !== undefined ? { runId } : {}),
  };
  if (sameObject(state.owners, next.owners))
    next = { ...next, owners: state.owners };
  if (type === 'MESSAGES_SNAPSHOT')
    next = seedHistory(next, event['messages'] as Message[]);
  if (sameObject(state, next)) next = state;
  events.push(event as unknown as AGUIEvent);
  return { state: next, events };
}

/** Seeds restated native IDs while preserving retained lifecycle and activities. */
function seedHistory(
  state: ɵAgUiSubagentsState,
  history: readonly Message[],
): ɵAgUiSubagentsState {
  let next = state;
  for (const message of history) {
    const owner = message.subagentRunId ?? undefined;
    if (owner !== undefined && typeof owner !== 'string')
      throw new Error('Invalid history attribution.');
    const bucket =
      message.role === 'reasoning'
        ? 'reasoning'
        : message.role === 'activity'
          ? 'activity'
          : 'message';
    const owners = {
      ...next.owners,
      [bucket]: new Map(next.owners[bucket]).set(message.id, owner),
    };
    if (message.role === 'assistant') {
      const tools = new Map(owners.tool);
      for (const tool of message.toolCalls ?? []) tools.set(tool.id, owner);
      owners.tool = tools;
    }
    let records = next.records;
    if (
      owner !== undefined &&
      !records.some((record) => record.subagentRunId === owner)
    )
      records = [
        ...records,
        Object.freeze({
          subagentRunId: owner,
          status: 'unknown',
          interruptIds: Object.freeze([]),
        }),
      ];
    let toolIdentities = next.toolIdentities;
    if (message.role === 'assistant') {
      for (const tool of message.toolCalls ?? []) {
        const identity = Object.freeze({
          toolCallName: tool.function.name,
          parentMessageId: message.id,
        });
        const previous = toolIdentities.get(tool.id);
        if (!previous || !sameObject(previous, identity))
          toolIdentities = new Map(toolIdentities).set(tool.id, identity);
      }
    }
    const retainedOwners = {
      message: reuseMap(next.owners.message, owners.message),
      reasoning: reuseMap(next.owners.reasoning, owners.reasoning),
      tool: reuseMap(next.owners.tool, owners.tool),
      activity: reuseMap(next.owners.activity, owners.activity),
    };
    const nextOwners = sameObject(next.owners, retainedOwners)
      ? next.owners
      : retainedOwners;
    if (
      nextOwners !== next.owners ||
      records !== next.records ||
      toolIdentities !== next.toolIdentities
    )
      next = { ...next, owners: nextOwners, records, toolIdentities };
  }
  return next;
}

/** Checks required and optional opaque string fields, including in-process producers. */
function stringField(
  value: Readonly<Record<string, unknown>>,
  field: string,
  required = false,
): void {
  if (
    (required || value[field] !== undefined) &&
    typeof value[field] !== 'string'
  )
    throw new Error(`Invalid ${field}: expected string.`);
}
/** Copies present string metadata after validation. */
function optionalStrings(
  event: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): Record<string, string> {
  return Object.fromEntries(
    fields
      .filter((field) => event[field] !== undefined)
      .map((field) => [field, event[field] as string]),
  );
}
/** Reads only a producer-supplied finite timestamp. */
function finiteTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}
/** Replaces one row while preserving first-observation order and sibling identities. */
function replaceRecord(
  records: readonly SubagentRun[],
  next: SubagentRun,
): readonly SubagentRun[] {
  return records.some((record) => record.subagentRunId === next.subagentRunId)
    ? records.map((record) =>
        record.subagentRunId === next.subagentRunId ? next : record,
      )
    : [...records, next];
}
/** Compares shallow immutable records. */
function sameObject(left: object, right: object): boolean {
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) =>
        (left as Record<string, unknown>)[key] ===
        (right as Record<string, unknown>)[key],
    )
  );
}
/** Retains the original identity bucket when its entries are unchanged. */
function reuseMap<K, V>(
  previous: ReadonlyMap<K, V>,
  next: ReadonlyMap<K, V>,
): ReadonlyMap<K, V> {
  return previous.size === next.size &&
    [...next].every(
      ([key, value]) => previous.has(key) && previous.get(key) === value,
    )
    ? previous
    : next;
}
