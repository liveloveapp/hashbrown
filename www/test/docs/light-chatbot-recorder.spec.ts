import { EventType, type RunAgentInput } from '@ag-ui/core';
import { expect, test } from 'vitest';
import {
  createLightChatbotCaptions,
  createLightChatbotEntry,
  createLightChatbotEvents,
  createLightChatbotTranscript,
  selectLightChatbotModes,
} from '../../src/tools/docs-light-chatbot-fixtures';

const input = (messages: RunAgentInput['messages']): RunAgentInput => ({
  threadId: 'thread',
  runId: 'run',
  messages,
  tools: [],
  context: [],
  state: {},
  forwardedProps: {},
});
const user = {
  id: 'user',
  role: 'user' as const,
  content: 'Set the desk light to 40%.',
};
const tool = {
  id: 'result',
  role: 'tool' as const,
  toolCallId: 'run:readLights',
  content: JSON.stringify({
    revision: 0,
    lights: [{ id: 'desk', name: 'Desk light', brightness: 80 }],
  }),
};
const text = (events: ReturnType<typeof createLightChatbotEvents>) =>
  events
    .filter((event) => event.type === EventType.TEXT_MESSAGE_CONTENT)
    .map((event) => ('delta' in event ? event.delta : ''))
    .join('');

test('chatbot modes preserve both real captures and reject unknown selections', () => {
  const modes = selectLightChatbotModes();

  expect(modes).toEqual(['ui-chatbot-react', 'ui-chatbot-angular']);
  expect(selectLightChatbotModes('ui-chatbot-angular')).toEqual([
    'ui-chatbot-angular',
  ]);
  expect(() => selectLightChatbotModes('typo')).toThrow(/Unknown/);
  expect(() => selectLightChatbotModes('')).toThrow(/Unknown/);
});

test('chatbot emits browser tool events before trusted UI and awaits canonical continuation', () => {
  const first = createLightChatbotEvents(input([user]));
  const continued = createLightChatbotEvents(
    input([
      user,
      {
        id: 'assistant',
        role: 'assistant',
        toolCalls: [
          {
            id: 'run:readLights',
            type: 'function',
            function: { name: 'readLights', arguments: '{}' },
          },
        ],
      },
      tool,
    ]),
  );

  expect(first.map((event) => event.type)).toEqual([
    EventType.RUN_STARTED,
    EventType.TOOL_CALL_START,
    EventType.TOOL_CALL_ARGS,
    EventType.TOOL_CALL_END,
    EventType.RUN_FINISHED,
  ]);
  expect(first[1]).toMatchObject({
    toolCallName: 'readLights',
    toolCallId: 'run:readLights',
  });
  expect(first[2]).toMatchObject({ delta: '{}' });
  expect(JSON.parse(text(continued))).toEqual({
    ui: [{ LightProposal: { props: { lightId: 'desk', brightness: 40 } } }],
  });
});

test('follow-up requires a fresh browser tool result and renders its updated brightness', () => {
  const followup = {
    id: 'followup',
    role: 'user' as const,
    content: 'What is the desk light set to now?',
  };
  const pending = createLightChatbotEvents(input([user, tool, followup]));
  const continued = createLightChatbotEvents(
    input([
      user,
      tool,
      followup,
      {
        ...tool,
        id: 'updated',
        content: JSON.stringify({
          revision: 1,
          lights: [{ id: 'desk', name: 'Desk light', brightness: 40 }],
        }),
      },
    ]),
  );

  expect(pending[1]).toMatchObject({ toolCallName: 'readLights' });
  expect(JSON.parse(text(continued))).toEqual({
    ui: [{ LightReading: { props: { lightId: 'desk', brightness: 40 } } }],
  });
});

test('adverse transport fixtures preserve valid rendered UI before failed or truncated endings', () => {
  const request = input([user, tool]);

  for (const outcome of ['failed', 'truncated'] as const) {
    const events = createLightChatbotEvents(request, outcome);
    expect(JSON.parse(text(events))).toHaveProperty('ui');
    expect(events.at(-1)).toMatchObject(
      outcome === 'failed'
        ? { type: EventType.RUN_ERROR }
        : {
            type: EventType.RUN_FINISHED,
            metadata: { hashbrown: { finishReason: 'length' } },
          },
    );
  }
  expect(
    JSON.parse(text(createLightChatbotEvents(request, 'invalid-id'))).ui[0]
      .LightProposal.props.lightId,
  ).toBe('unknown');
  expect(
    JSON.parse(text(createLightChatbotEvents(request, 'invalid-brightness')))
      .ui[0].LightProposal.props.brightness,
  ).toBe(101);
});

test('entries mount checked clients and transcripts name their actual framework', () => {
  const react = createLightChatbotEntry('ui-chatbot-react', '/checked');
  const angular = createLightChatbotEntry('ui-chatbot-angular', '/checked');

  expect(react).toContain('/checked/react/src/LightChatbot.js');
  expect(angular).toContain('/checked/angular/src/app/light-chatbot.js');
  expect(react + angular).toContain('__unmountLightChatbot');
  for (const mode of selectLightChatbotModes()) {
    const transcript = createLightChatbotTranscript(mode);
    expect(transcript).toContain(
      mode.endsWith('react')
        ? 'checked React component'
        : 'checked Angular component',
    );
    expect(transcript).toContain('HTTP transport boundary');
    expect(transcript).toContain('no live model');
    expect(transcript).toContain('real browser tool handler');
  }
});

test('chatbot captions coalesce rapid measured phases into intervals of at least one second', () => {
  const vtt = createLightChatbotCaptions(
    [
      { seconds: 0, text: 'Send.' },
      { seconds: 0.1, text: 'Read.' },
      { seconds: 0.2, text: 'Render.' },
      { seconds: 2, text: 'Apply.' },
    ],
    7,
  );

  expect(vtt).toContain('WEBVTT');
  expect(vtt).toContain('Send. Read. Render.');
  const times = [
    ...vtt.matchAll(
      /(\d\d):(\d\d):(\d\d\.\d{3}) --> (\d\d):(\d\d):(\d\d\.\d{3})/g,
    ),
  ];
  expect(times.length).toBeGreaterThan(1);
  for (const time of times)
    expect(
      Number(time[4]) * 3600 +
        Number(time[5]) * 60 +
        Number(time[6]) -
        (Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3])),
    ).toBeGreaterThanOrEqual(1);
});
