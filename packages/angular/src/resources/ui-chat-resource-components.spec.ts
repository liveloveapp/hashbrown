/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventType } from '@ag-ui/core';
import { TestBed } from '@angular/core/testing';
import { s, type TransportRequest } from '@hashbrownai/core';
import { provideHashbrown } from '../providers';
import { TAG_NAME_REGISTRY } from '../utils/ui-chat.helpers';
import { uiChatResource } from './ui-chat-resource.fn';

class FlightCard {}
class AirportCard {}
const flight = {
  component: FlightCard,
  name: 'Flight',
  description: 'One aircraft',
  props: { callsign: s.string('Callsign') },
};
const airport = {
  component: AirportCard,
  name: 'Airport',
  description: 'An airport',
  props: { code: s.string('Code') },
};

function answer(request: TransportRequest, messageId: string, ui: unknown) {
  const identity = {
    threadId: request.input.threadId,
    runId: request.input.runId,
  };
  return {
    events: (async function* () {
      yield { type: EventType.RUN_STARTED, ...identity };
      yield {
        type: EventType.TEXT_MESSAGE_START,
        messageId,
        role: 'assistant' as const,
      };
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta: JSON.stringify({ ui }),
      };
      yield { type: EventType.TEXT_MESSAGE_END, messageId };
      yield { type: EventType.RUN_FINISHED, ...identity };
    })(),
  };
}

function sentSchema(request: TransportRequest | undefined): string {
  return JSON.stringify(
    (request?.input.forwardedProps as { hashbrown?: unknown }).hashbrown,
  );
}

async function settle() {
  for (let i = 0; i < 10; i++) {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function configure(send: (request: TransportRequest) => unknown) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHashbrown({ transport: { name: 'test', send } as never }),
    ],
  });
}

test('uiChatResource exposes its components as a signal', () => {
  configure(vi.fn());
  const components = [flight, airport];
  const chat = TestBed.runInInjectionContext(() =>
    uiChatResource({ system: 'Answer.', components }),
  );

  const initial = chat.components();
  chat.setComponents([airport]);

  expect(initial).toBe(components);
  expect(chat.components()).toEqual([airport]);
});

test('uiChatResource setComponents changes what the next request sends', async () => {
  const send = vi.fn(async (request: TransportRequest) =>
    answer(request, 'answer-1', [{ Airport: { props: { code: 'SFO' } } }]),
  );
  configure(send);
  const chat = TestBed.runInInjectionContext(() =>
    uiChatResource({
      system: 'Answer.',
      components: [flight, airport],
      debounce: 0,
    }),
  );
  await settle();

  chat.setComponents([airport]);
  chat.sendMessage({ role: 'user', content: 'SFO' });
  await settle();

  expect(send).toHaveBeenCalledTimes(1);
  expect(sentSchema(send.mock.calls[0]?.[0])).toContain('Airport');
  expect(sentSchema(send.mock.calls[0]?.[0])).not.toContain('Flight');
});

test('uiChatResource keeps rendering earlier answers after setComponents narrows the components', async () => {
  let turn = 0;
  const send = vi.fn(async (request: TransportRequest) => {
    turn += 1;
    return turn === 1
      ? answer(request, 'answer-1', [
          { Flight: { props: { callsign: 'UA1' } } },
        ])
      : answer(request, 'answer-2', [{ Airport: { props: { code: 'SFO' } } }]);
  });
  configure(send);
  const chat = TestBed.runInInjectionContext(() =>
    uiChatResource({
      system: 'Answer.',
      components: [flight, airport],
      debounce: 0,
    }),
  );
  await settle();
  chat.sendMessage({ role: 'user', content: 'UA1' });
  await settle();

  chat.setComponents([airport]);
  chat.sendMessage({ role: 'user', content: 'SFO' });
  await settle();

  const answers = chat
    .value()
    .filter((message) => message.role === 'assistant') as any[];
  expect(answers.map((message) => message.content)).toEqual([
    { ui: [{ Flight: expect.anything() }] },
    { ui: [{ Airport: expect.anything() }] },
  ]);
  expect(Object.keys(answers[0][TAG_NAME_REGISTRY])).toEqual(
    expect.arrayContaining(['Flight', 'Airport']),
  );
});
