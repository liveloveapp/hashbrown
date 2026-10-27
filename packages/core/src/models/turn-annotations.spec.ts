import { groupTurns, type Turn } from './group-turns';
import {
  collectTurnAttributions,
  collectTurnSources,
} from './turn-annotations';
import type {
  AnyMessage,
  Attribution,
  ServerToolCallSource,
} from './view.models';

test('collects sources by assistant, then own sources before server calls, keeping first IDs', () => {
  const own: ServerToolCallSource = Object.freeze({
    id: 'own',
    kind: 'url',
    title: 'Own',
    href: 'https://example.com',
  });
  const first: ServerToolCallSource = Object.freeze({
    id: 'first',
    kind: 'url',
    title: 'First',
    href: 'https://example.com',
  });
  const second: ServerToolCallSource = Object.freeze({
    id: 'second',
    kind: 'document',
    title: 'Second',
  });
  const later: ServerToolCallSource = Object.freeze({
    id: 'later',
    kind: 'record',
    title: 'Later',
  });
  const duplicate = Object.freeze({ ...own, title: 'Duplicate' });
  const messages: readonly AnyMessage[] = Object.freeze([
    Object.freeze({
      role: 'assistant' as const,
      id: 'a1',
      toolCalls: [],
      sources: Object.freeze([own]),
      serverToolCalls: Object.freeze([
        Object.freeze({
          toolCallId: 's1',
          name: 'search',
          status: 'complete' as const,
          args: null,
          sources: Object.freeze([first, duplicate]),
        }),
        Object.freeze({
          toolCallId: 's2',
          name: 'search',
          status: 'complete' as const,
          args: null,
          sources: Object.freeze([second, first]),
        }),
      ]),
    }),
    Object.freeze({
      role: 'assistant' as const,
      id: 'a2',
      toolCalls: [],
      sources: Object.freeze([duplicate, later]),
    }),
  ]);
  const [grouped] = groupTurns(messages);
  const turn: Turn<AnyMessage> = Object.freeze({
    ...grouped,
    assistants: Object.freeze(grouped.assistants),
  });

  const result = collectTurnSources(turn);

  expect(result).toEqual([own, first, second, later]);
  expect(result[0]).toBe(own);
  expect(result[1]).toBe(first);
  expect(result[2]).toBe(second);
  expect(result[3]).toBe(later);
});

test('collects attribution owners without altering duplicate HTML or map widget tokens', () => {
  const html =
    '<div data-provider="google">  <a href="/search?q=a&b">Search</a>\n</div>';
  const suggestion: Attribution = Object.freeze({
    provider: 'google',
    kind: 'search-suggestions',
    html,
    mustRender: true,
  });
  const duplicate: Attribution = Object.freeze({ ...suggestion });
  const maps: Attribution = Object.freeze({
    provider: 'google',
    kind: 'maps',
    widgetToken: ' opaque/+token== \n',
    mustRender: true,
  });
  const messages: readonly AnyMessage[] = Object.freeze([
    Object.freeze({
      role: 'assistant' as const,
      id: 'a1',
      toolCalls: [],
      attribution: Object.freeze([suggestion, suggestion]),
    }),
    Object.freeze({
      role: 'assistant' as const,
      id: 'a2',
      toolCalls: [],
      attribution: Object.freeze([duplicate, maps]),
    }),
  ]);
  const [grouped] = groupTurns(messages);
  const turn: Turn<AnyMessage> = Object.freeze({
    ...grouped,
    assistants: Object.freeze(grouped.assistants),
  });

  const result = collectTurnAttributions(turn);

  expect(result).toEqual([
    { assistantMessageId: 'a1', attribution: suggestion },
    { assistantMessageId: 'a1', attribution: suggestion },
    { assistantMessageId: 'a2', attribution: duplicate },
    { assistantMessageId: 'a2', attribution: maps },
  ]);
  expect(result[0].attribution).toBe(suggestion);
  expect(result[1].attribution).toBe(suggestion);
  expect(result[2].attribution).toBe(duplicate);
  expect(result[3].attribution).toBe(maps);
  expect(result[0].attribution.html).toBe(html);
  expect(result[3].attribution.widgetToken).toBe(' opaque/+token== \n');
});

test('returns empty annotations when assistants and server calls have none', () => {
  const [turn] = groupTurns<AnyMessage>([
    {
      role: 'assistant',
      id: 'a1',
      toolCalls: [],
      serverToolCalls: [
        { toolCallId: 's1', name: 'search', status: 'executing', args: null },
      ],
    },
  ]);
  const [emptyTurn] = groupTurns<AnyMessage>([
    { role: 'user', id: 'u1', content: '' },
  ]);

  const sources = collectTurnSources(turn);
  const attributions = collectTurnAttributions(turn);

  expect(sources).toEqual([]);
  expect(attributions).toEqual([]);
  expect(collectTurnSources(emptyTurn)).toEqual([]);
  expect(collectTurnAttributions(emptyTurn)).toEqual([]);
});
