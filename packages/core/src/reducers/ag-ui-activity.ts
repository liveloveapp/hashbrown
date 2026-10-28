import type {
  ActivityDeltaEvent,
  ActivitySnapshotEvent,
  Message,
} from '@ag-ui/core';
import type { ActivityLinks } from '../models/view.models';
import { applyJsonPatch } from '../utils/json-patch';
import { cloneAndFreezeOptionalJsonValue } from '../utils/json-value';
import type { JsonValue } from '../utils/types';
import { ɵownAgUiJsonValue } from './ag-ui-json-value';

/**
 * Run facts current when an activity event arrives, used to link a new
 * activity to what it belongs to.
 *
 * @internal
 */
export interface ActivityArrival {
  /** The run that delivered the event. */
  readonly runId?: string;
  /** The last assistant message started in the current run. */
  readonly assistantMessageId?: string;
  /** The latest tool call of any kind started in the current run. */
  readonly toolCallId?: string;
}

/** The canonical activity record with the links Hashbrown keeps on it. */
type ActivityRecord = Extract<Message, { role: 'activity' }> & {
  readonly hashbrownLinks?: ActivityLinks;
};

type Metadata = Readonly<Record<string, unknown>>;

/**
 * Applies an `ACTIVITY_SNAPSHOT` to canonical history.
 *
 * A snapshot with a new id appends an activity message and records its links.
 * A missing `replace` (or `replace: true`) overwrites the content, type and
 * `subagentRunId` in place. It keeps links within the same owner lane and uses
 * incoming arrival links when the owner changes. `replace: false` on an existing
 * activity keeps its content and only merges `metadata`.
 *
 * @param messages - Canonical history the snapshot applies to.
 * @param event - The activity snapshot.
 * @param arrival - Owner-local run facts for a new or re-owned activity.
 * @returns The next history, or `messages` itself when nothing changed.
 * @throws TypeError when the id belongs to a non-activity message or tool
 *   call, or when the content is not a JSON object.
 * @internal
 */
export function applyActivitySnapshot(
  messages: readonly Readonly<Message>[],
  event: ActivitySnapshotEvent,
  arrival: ActivityArrival,
): readonly Readonly<Message>[] {
  const index = messages.findIndex((message) => message.id === event.messageId);
  const current = index === -1 ? undefined : messages[index];
  if (current && current.role !== 'activity') {
    throw new TypeError(
      `AG-UI message ${event.messageId} cannot change role from ${current.role} to activity`,
    );
  }
  if (!current && hasToolCall(messages, event.messageId)) {
    throw new TypeError(
      `AG-UI activity ID ${event.messageId} conflicts with a tool call ID`,
    );
  }
  const metadata = ownMetadata(event.metadata);
  const existing = current as ActivityRecord | undefined;

  if (existing && event.replace === false) {
    return metadata === undefined
      ? messages
      : replaceAt(messages, index, withMetadata(existing, metadata));
  }

  const content = ownContent(event.content);
  const subagentRunId =
    typeof event.subagentRunId === 'string' ? event.subagentRunId : undefined;
  const links =
    existing && existing.subagentRunId === subagentRunId
      ? existing.hashbrownLinks
      : createLinks(arrival, subagentRunId);
  const record = withMetadata(
    {
      ...(existing ?? {}),
      id: event.messageId,
      role: 'activity',
      activityType: event.activityType,
      content,
      subagentRunId,
      hashbrownLinks: links,
    },
    metadata,
  );

  return existing
    ? replaceAt(messages, index, record)
    : Object.freeze([...messages, record]);
}

/**
 * Applies an `ACTIVITY_DELTA` to canonical history.
 *
 * The RFC 6902 patch is applied all-or-nothing to a copy of the content, so
 * earlier history is never mutated. A delta for an unknown id is dropped. A
 * delta whose patch fails is dropped, but any valid `metadata` it carries is
 * kept. A drop never throws; the caller decides how to report it. The
 * activity keeps the `activityType` it already has; a delta naming a different
 * type does not change it.
 *
 * @param messages - Canonical history the delta applies to.
 * @param event - The activity delta.
 * @returns The next history, and the reason the delta was dropped, if it was.
 * @internal
 */
export function applyActivityDelta(
  messages: readonly Readonly<Message>[],
  event: ActivityDeltaEvent,
): {
  readonly messages: readonly Readonly<Message>[];
  readonly dropped?: string;
} {
  const index = messages.findIndex(
    (message) => message.id === event.messageId && message.role === 'activity',
  );
  if (index === -1) {
    return {
      messages,
      dropped: `ACTIVITY_DELTA for unknown activity ${event.messageId} was dropped`,
    };
  }
  const current = messages[index] as ActivityRecord;

  let metadata: Metadata | undefined;
  try {
    metadata = ownMetadata(event.metadata);
  } catch (error) {
    return {
      messages,
      dropped: dropReason(event.messageId, 'its metadata is invalid', error),
    };
  }

  let content: ActivityRecord['content'];
  try {
    content = ownContent(
      applyJsonPatch(
        current.content as JsonValue,
        event.patch as Parameters<typeof applyJsonPatch>[1],
      ),
    );
  } catch (error) {
    return {
      messages:
        metadata === undefined
          ? messages
          : replaceAt(messages, index, withMetadata(current, metadata)),
      dropped: dropReason(event.messageId, 'its patch failed', error),
    };
  }

  return {
    messages: replaceAt(
      messages,
      index,
      withMetadata({ ...current, content }, metadata),
    ),
  };
}

/**
 * Reads the links Hashbrown recorded on a canonical activity message.
 *
 * @param message - A canonical AG-UI message.
 * @returns The activity's links, or `undefined` for other roles or activities
 *   without recorded links.
 * @internal
 */
export function readActivityLinks(
  message: Readonly<Message>,
): ActivityLinks | undefined {
  return message.role === 'activity'
    ? (message as ActivityRecord).hashbrownLinks
    : undefined;
}

/**
 * Recomputes the links of every activity in a list from its position.
 *
 * Used for activities that arrive through `MESSAGES_SNAPSHOT`, `setMessages`
 * or initial `messages`, whose incoming `hashbrownLinks` are never trusted.
 * `assistantMessageId` is the nearest assistant message before the activity
 * in the same owner lane and turn (a parent user message clears every lane),
 * `toolCallId` is that
 * assistant's last tool call, and `subagentRunId` comes from the activity
 * message itself. `runId` is stamped only on activities after the last user
 * message; the run of earlier turns is unknown.
 *
 * @param messages - Canonical history whose activities arrived together.
 * @param runId - The run that delivered the list, if any.
 * @returns The history with fresh links on each activity, or `messages`
 *   itself when it holds no activity.
 * @internal
 */
export function recomputeActivityLinks(
  messages: readonly Readonly<Message>[],
  runId?: string,
): readonly Readonly<Message>[] {
  if (!messages.some((message) => message.role === 'activity')) {
    return messages;
  }
  const lastUserIndex = messages.findLastIndex(
    (message) => message.role === 'user',
  );
  const assistants = new Map<
    string | undefined,
    Extract<Message, { role: 'assistant' }>
  >();
  return Object.freeze(
    messages.map((message, index) => {
      if (message.role === 'user') {
        if (message.subagentRunId === undefined) assistants.clear();
        else assistants.delete(message.subagentRunId);
        return message;
      }
      if (message.role === 'assistant') {
        assistants.set(message.subagentRunId, message);
        return message;
      }
      if (message.role !== 'activity') {
        return message;
      }
      const record = message as ActivityRecord;
      const assistant = assistants.get(record.subagentRunId);
      return withMetadata(
        {
          ...record,
          hashbrownLinks: createLinks(
            {
              runId: index > lastUserIndex ? runId : undefined,
              assistantMessageId: assistant?.id,
              toolCallId: assistant?.toolCalls?.at(-1)?.id,
            },
            typeof record.subagentRunId === 'string'
              ? record.subagentRunId
              : undefined,
          ),
        },
        undefined,
      );
    }),
  );
}

/**
 * Applies the activity-set rule of `MESSAGES_SNAPSHOT` to canonical history.
 *
 * A snapshot that carries any activity replaces the activity set, so it is
 * returned as is. A snapshot that carries none keeps the local activities:
 * each one is re-inserted directly after its linked assistant message, or at
 * the end when that message is gone, in the original relative order. Every
 * other role keeps the snapshot's wholesale replace.
 *
 * @param previous - Canonical history before the snapshot.
 * @param snapshot - The owned snapshot messages.
 * @returns The next canonical history.
 * @internal
 */
export function mergeSnapshotActivities(
  previous: readonly Readonly<Message>[],
  snapshot: readonly Readonly<Message>[],
): readonly Readonly<Message>[] {
  if (snapshot.some((message) => message.role === 'activity')) {
    return snapshot;
  }
  const taken = new Set(
    snapshot.flatMap((message) => [
      message.id,
      ...(message.role === 'assistant'
        ? (message.toolCalls ?? []).map((toolCall) => toolCall.id)
        : []),
    ]),
  );
  const kept = previous.filter(
    (message) => message.role === 'activity' && !taken.has(message.id),
  );
  if (kept.length === 0) {
    return snapshot;
  }
  const assistantIds = new Set(
    snapshot
      .filter((message) => message.role === 'assistant')
      .map((message) => message.id),
  );
  const anchorOf = (activity: Readonly<Message>) => {
    const id = readActivityLinks(activity)?.assistantMessageId;
    return id !== undefined && assistantIds.has(id) ? id : undefined;
  };
  return Object.freeze([
    ...snapshot.flatMap((message) => [
      message,
      ...(message.role === 'assistant'
        ? kept.filter((activity) => anchorOf(activity) === message.id)
        : []),
    ]),
    ...kept.filter((activity) => anchorOf(activity) === undefined),
  ]);
}

function createLinks(
  arrival: ActivityArrival,
  subagentRunId: string | undefined,
): ActivityLinks {
  return Object.freeze({
    ...(arrival.runId === undefined ? {} : { runId: arrival.runId }),
    ...(arrival.assistantMessageId === undefined
      ? {}
      : { assistantMessageId: arrival.assistantMessageId }),
    ...(arrival.toolCallId === undefined
      ? {}
      : { toolCallId: arrival.toolCallId }),
    ...(subagentRunId === undefined ? {} : { subagentRunId }),
  });
}

function ownContent(value: unknown): ActivityRecord['content'] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('AG-UI activity content must be a JSON object');
  }
  return cloneAndFreezeOptionalJsonValue(value) as ActivityRecord['content'];
}

function ownMetadata(value: unknown): Metadata | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('AG-UI activity metadata must be a JSON object');
  }
  return ɵownAgUiJsonValue(value) as Metadata;
}

/** Shallow-merges incoming metadata and freezes the record without undefined fields. */
function withMetadata(
  record: ActivityRecord,
  metadata: Metadata | undefined,
): Readonly<Message> {
  const next: Record<string, unknown> = {
    ...record,
    ...(metadata === undefined
      ? {}
      : { metadata: Object.freeze({ ...record.metadata, ...metadata }) }),
  };
  for (const key of ['subagentRunId', 'hashbrownLinks', 'metadata']) {
    if (next[key] === undefined) {
      delete next[key];
    }
  }
  return Object.freeze(next) as unknown as Readonly<Message>;
}

function replaceAt(
  messages: readonly Readonly<Message>[],
  index: number,
  message: Readonly<Message>,
): readonly Readonly<Message>[] {
  return Object.freeze(
    messages.map((current, currentIndex) =>
      currentIndex === index ? message : current,
    ),
  );
}

function hasToolCall(messages: readonly Readonly<Message>[], id: string) {
  return messages.some(
    (message) =>
      message.role === 'assistant' &&
      (message.toolCalls ?? []).some((tool) => tool.id === id),
  );
}

function dropReason(messageId: string, why: string, error: unknown): string {
  const detail = error instanceof Error ? `: ${error.message}` : '';
  return `ACTIVITY_DELTA for activity ${messageId} was dropped because ${why}${detail}`;
}
