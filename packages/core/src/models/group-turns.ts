import type { ActivityMessage, AnyMessage } from './view.models';

/**
 * One conversational turn: an optional user message, the assistant messages
 * that answered it, and the activities and errors that arrived in between.
 *
 * @public
 */
export type Turn<M> = {
  /** The user message that opened the turn, if any. */
  user?: Extract<M, { role: 'user' }>;
  /** Assistant messages in the turn, in order. */
  assistants: readonly Extract<M, { role: 'assistant' }>[];
  /** Activities linked to each assistant message, keyed by its id. */
  activitiesByAssistant: ReadonlyMap<string, readonly ActivityMessage[]>;
  /** Activities linked to a tool call (client or server), keyed by toolCallId. */
  activitiesByToolCall: ReadonlyMap<string, readonly ActivityMessage[]>;
  /** Activities in the turn with no assistant or tool-call link. */
  unlinkedActivities: readonly ActivityMessage[];
  /** Error messages in the turn, in order. */
  errors: readonly Extract<M, { role: 'error' }>[];
};

type Group = {
  user?: AnyMessage;
  members: AnyMessage[];
};

const append = (
  map: Map<string, ActivityMessage[]>,
  key: string,
  value: ActivityMessage,
): void => {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
};

const toolCallIdsOf = (message: AnyMessage): string[] => {
  if (message.role !== 'assistant') return [];
  return [
    ...(message.toolCalls ?? []).map((call) => call.toolCallId),
    ...(message.serverToolCalls ?? []).map((call) => call.toolCallId),
  ];
};

/**
 * Groups a flat message list into turns that each start at a user message,
 * and buckets the activities of each turn by what they belong to.
 *
 * Messages before the first user message form a turn without a `user`. An
 * activity goes to `activitiesByToolCall` when its `links.toolCallId` matches
 * a client or server tool call of an assistant in the same turn. Otherwise it
 * goes to `activitiesByAssistant` when its `links.assistantMessageId` matches
 * an assistant in the turn. Anything else is `unlinkedActivities`.
 *
 * The function is pure: it does not mutate its input and keeps the input
 * order inside every bucket.
 *
 * @example
 * ```ts
 * for (const turn of groupTurns(chat.messages())) {
 *   for (const assistant of turn.assistants) {
 *     const plans = turn.activitiesByAssistant.get(assistant.id) ?? [];
 *   }
 * }
 * ```
 *
 * @public
 * @param messages - The chat messages, in order.
 * @returns The turns, in order.
 */
export function groupTurns<M extends AnyMessage>(
  messages: readonly M[],
): readonly Turn<M>[] {
  const groups: Group[] = [];

  for (const message of messages) {
    if (message.role === 'user') {
      groups.push({ user: message, members: [] });
      continue;
    }
    if (groups.length === 0) groups.push({ members: [] });
    groups[groups.length - 1].members.push(message);
  }

  return groups.map((group) => {
    const assistants = group.members.filter(
      (message) => message.role === 'assistant',
    );
    const toolCallIds = new Set(assistants.flatMap(toolCallIdsOf));
    const assistantIds = new Set(
      assistants.map((message) => (message as { id: string }).id),
    );
    const activitiesByAssistant = new Map<string, ActivityMessage[]>();
    const activitiesByToolCall = new Map<string, ActivityMessage[]>();
    const unlinkedActivities: ActivityMessage[] = [];

    for (const member of group.members) {
      if (member.role !== 'activity') continue;
      const { toolCallId, assistantMessageId } = member.links;
      if (toolCallId !== undefined && toolCallIds.has(toolCallId)) {
        append(activitiesByToolCall, toolCallId, member);
      } else if (
        assistantMessageId !== undefined &&
        assistantIds.has(assistantMessageId)
      ) {
        append(activitiesByAssistant, assistantMessageId, member);
      } else {
        unlinkedActivities.push(member);
      }
    }

    return {
      ...(group.user ? { user: group.user } : {}),
      assistants,
      activitiesByAssistant,
      activitiesByToolCall,
      unlinkedActivities,
      errors: group.members.filter((message) => message.role === 'error'),
    } as unknown as Turn<M>;
  });
}
