import { groupTurns } from './group-turns';
import type { ActivityLinks, ActivityMessage, AnyMessage } from './view.models';

const activity = (id: string, links: ActivityLinks): ActivityMessage => ({
  role: 'activity',
  id,
  activityType: 'plan',
  content: {},
  links,
});

const user = (id: string): AnyMessage => ({
  role: 'user',
  id,
  content: id,
});

const assistant = (
  id: string,
  toolCallIds: string[] = [],
  serverToolCallIds: string[] = [],
): AnyMessage =>
  ({
    role: 'assistant',
    id,
    content: id,
    toolCalls: toolCallIds.map((toolCallId) => ({ toolCallId })),
    ...(serverToolCallIds.length
      ? {
          serverToolCalls: serverToolCallIds.map((toolCallId) => ({
            toolCallId,
          })),
        }
      : {}),
  }) as unknown as AnyMessage;

test('groups messages into turns that start at user messages', () => {
  const a0 = assistant('a0');
  const u1 = user('u1');
  const a1 = assistant('a1');
  const a2 = assistant('a2');
  const err: AnyMessage = { role: 'error', content: 'boom' };
  const u2 = user('u2');

  const turns = groupTurns([a0, u1, a1, a2, err, u2]);

  expect(turns).toHaveLength(3);
  expect(turns[0].user).toBeUndefined();
  expect(turns[0].assistants).toEqual([a0]);
  expect(turns[1].user).toBe(u1);
  expect(turns[1].assistants).toEqual([a1, a2]);
  expect(turns[1].errors).toEqual([err]);
  expect(turns[2].user).toBe(u2);
  expect(turns[2].assistants).toEqual([]);
  expect(groupTurns([])).toEqual([]);
});

test('buckets activities by tool call, then assistant, else unlinked', () => {
  const byClientCall = activity('x1', {
    toolCallId: 'client-1',
    assistantMessageId: 'a1',
  });
  const byServerCall = activity('x2', { toolCallId: 'server-1' });
  const byAssistant = activity('x3', { assistantMessageId: 'a1' });
  const staleToolCall = activity('x4', {
    toolCallId: 'gone',
    assistantMessageId: 'a1',
  });
  const unlinked = activity('x5', { assistantMessageId: 'elsewhere' });
  const bare = activity('x6', {});

  const [turn] = groupTurns([
    user('u1'),
    assistant('a1', ['client-1'], ['server-1']),
    byClientCall,
    byServerCall,
    byAssistant,
    staleToolCall,
    unlinked,
    bare,
  ]);

  expect(turn.activitiesByToolCall.get('client-1')).toEqual([byClientCall]);
  expect(turn.activitiesByToolCall.get('server-1')).toEqual([byServerCall]);
  expect(turn.activitiesByAssistant.get('a1')).toEqual([
    byAssistant,
    staleToolCall,
  ]);
  expect(turn.unlinkedActivities).toEqual([unlinked, bare]);
});

test('keeps input order inside each bucket and does not mutate its input', () => {
  const first = activity('x1', { assistantMessageId: 'a1' });
  const second = activity('x2', { assistantMessageId: 'a1' });
  const third = activity('x3', { assistantMessageId: 'a1' });
  const input = Object.freeze([
    user('u1'),
    assistant('a1'),
    first,
    second,
    third,
  ]);
  const snapshot = JSON.stringify(input);

  const [turn] = groupTurns(input);

  expect(turn.activitiesByAssistant.get('a1')).toEqual([first, second, third]);
  expect(JSON.stringify(input)).toBe(snapshot);
});
