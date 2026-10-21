import {
  ATC_SOURCE_URL,
  createAtcStore,
  SELECTED_PROMPT,
  type Starter,
  STARTER_PROMPTS,
  transcriptItems,
} from '@atc/shared';
import { fakeDecisionTransport, testAircraft } from '@atc/shared/testing';
import { TestBed } from '@angular/core/testing';
import { provideHashbrown } from '@hashbrownai/angular';
import { expect, test, vi } from 'vitest';
import { Composer } from './composer';
import { EmptyState } from './empty-state';
import { PanelHeader } from './panel-header';
import { ToolChips } from './tool-chips';
import { Transcript } from './transcript';
import { ROUTE_DECISION_TRANSPORT } from './router';
import { ATC_STORE } from './store';

const plane = testAircraft();

type Answer = Parameters<typeof fakeDecisionTransport>[0];

function setup(answer: Answer = () => ({ intent: 'chat', confidence: 0.9 })) {
  const store = createAtcStore();
  const model = fakeDecisionTransport(answer);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHashbrown({ baseUrl: '/unused' }),
      { provide: ATC_STORE, useValue: store },
      { provide: ROUTE_DECISION_TRANSPORT, useValue: model.transport },
    ],
  });

  return store;
}

function text(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

test('the header shows the mark, the credit, a quiet connecting notice and the GitHub link', () => {
  setup();

  const fixture = TestBed.createComponent(PanelHeader);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const link = element.querySelector('a[aria-label="atc source on GitHub"]');

  expect(element.querySelector('[aria-label="ATC"]')).not.toBeNull();
  expect(text(element)).toContain('built with Hashbrown');
  expect(text(element.querySelector('[role="status"]'))).toBe(
    'Connecting to live traffic…',
  );
  expect(link?.getAttribute('href')).toBe(ATC_SOURCE_URL);
  expect(link?.querySelector('svg path')).not.toBeNull();
});

test('the feed notice is silent while live and quiet while delayed', () => {
  const store = setup();
  const fixture = TestBed.createComponent(PanelHeader);
  const element = fixture.nativeElement as HTMLElement;

  store.setFeedStatus('live');
  store.applySnapshot({ at: 1, aircraft: [plane] });
  fixture.detectChanges();
  const live = element.querySelector('[role="status"]');
  store.setFeedStatus('delayed');
  fixture.detectChanges();

  expect(live).toBeNull();
  expect(text(element)).not.toContain('Live');
  expect(text(element.querySelector('[role="status"]'))).toBe(
    'Traffic data delayed',
  );
});

test('the empty state asks a question and offers every starter prompt', () => {
  setup();
  const fixture = TestBed.createComponent(EmptyState);
  const picked: Starter[] = [];
  fixture.componentInstance.pick.subscribe((starter) => picked.push(starter));

  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const buttons = [...element.querySelectorAll('button')];
  buttons[1]?.click();

  expect(text(element.querySelector('.atc-empty-title'))).toBe(
    'Ask about the planes over the Pacific Northwest.',
  );
  expect(buttons.map((button) => nameOf(button))).toEqual(
    STARTER_PROMPTS.map(
      (starter) =>
        `${starter.text} (${starter.route === 'filter' ? 'filter' : 'question'})`,
    ),
  );
  expect(
    buttons.map(
      (button) => button.querySelector('[aria-hidden="true"]')?.textContent,
    ),
  ).toEqual(
    STARTER_PROMPTS.map((starter) =>
      starter.route === 'filter' ? 'filter' : 'question',
    ),
  );
  expect(picked).toEqual([STARTER_PROMPTS[1]]);
});

test('the empty state offers the selected-plane question first while a plane is selected', () => {
  const store = setup();
  const fixture = TestBed.createComponent(EmptyState);

  store.select('aaaaaa');
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const buttons = [...element.querySelectorAll('button')];

  expect(nameOf(buttons[0])).toBe(`${SELECTED_PROMPT} (question)`);
  expect(buttons).toHaveLength(STARTER_PROMPTS.length + 1);
});

/** A button's accessible text: what assistive tech reads, without aria-hidden parts. */
function nameOf(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  copy
    .querySelectorAll('[aria-hidden="true"]')
    .forEach((hidden) => hidden.remove());

  return text(copy);
}

function composer(answer?: Answer) {
  setup(answer);
  const fixture = TestBed.createComponent(Composer);
  const sent: string[] = [];
  const filtered: string[] = [];
  const cleared: string[] = [];
  fixture.componentInstance.chat.subscribe((message) => sent.push(message));
  fixture.componentInstance.filter.subscribe((message) =>
    filtered.push(message),
  );
  fixture.componentInstance.clear.subscribe(() => cleared.push('clear'));
  fixture.detectChanges();
  document.body.appendChild(fixture.nativeElement);
  const element = fixture.nativeElement as HTMLElement;
  const input = element.querySelector('input') as HTMLInputElement;

  return { fixture, element, input, sent, filtered, cleared };
}

async function until(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    TestBed.tick();
    if (check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('condition not met');
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  TestBed.tick();
}

function enter(element: HTMLElement): void {
  element
    .querySelector('form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
}

/** Types into the composer and waits for the router's answer to show. */
async function typeAndDecide(
  view: ReturnType<typeof composer>,
  value: string,
  label: string,
): Promise<void> {
  type(view.input, value);
  await until(() => text(view.element.querySelector('.atc-route')) === label);
}

function slash(target: EventTarget): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: '/',
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);

  return event;
}

test('pressing / anywhere focuses the composer', () => {
  const { fixture, input } = composer();
  (document.activeElement as HTMLElement | null)?.blur();

  const event = slash(document.body);

  expect(document.activeElement).toBe(input);
  expect(event.defaultPrevented).toBe(true);
  fixture.destroy();
});

test('pressing / inside an input, textarea or contenteditable types a slash', () => {
  const { fixture, input } = composer();
  const other = document.createElement('input');
  const area = document.createElement('textarea');
  const editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  const inner = document.createElement('span');
  editable.appendChild(inner);
  document.body.append(other, area, editable);

  const events = [other, area, inner, input].map((target) => {
    if (target instanceof HTMLElement) {
      target.focus();
    }
    return slash(target).defaultPrevented;
  });

  expect(events).toEqual([false, false, false, false]);
  expect(document.activeElement).toBe(input);
  other.remove();
  area.remove();
  editable.remove();
  fixture.destroy();
});

test('submitting sends the trimmed draft to chat, clears the input and keeps focus', async () => {
  const view = composer();
  view.input.focus();

  await typeAndDecide(view, '  What is highest?  ', '→ chat 0.90');
  enter(view.element);
  await until(() => view.sent.length === 1);

  expect(view.sent).toEqual(['What is highest?']);
  expect(view.input.value).toBe('');
  expect(document.activeElement).toBe(view.input);
  view.fixture.destroy();
});

test('Enter on a filter-routed text applies the filter and adds nothing to the transcript', async () => {
  const view = composer(() => ({ intent: 'filter', confidence: 0.97 }));

  await typeAndDecide(view, 'only jets below 10,000 ft', '→ filter 0.97');
  enter(view.element);
  await until(() => view.filtered.length === 1);

  expect(view.filtered).toEqual(['only jets below 10,000 ft']);
  expect(view.sent).toEqual([]);
  expect(view.input.value).toBe('');
  view.fixture.destroy();
});

test('a clear routes to clearing the filter without a filter request', async () => {
  const view = composer(() => ({
    intent: 'filter',
    confidence: 0.95,
    clear: 0.9,
  }));

  await typeAndDecide(view, 'show everything again', '→ filter 0.95');
  enter(view.element);
  await until(() => view.cleared.length === 1);

  expect(view.filtered).toEqual([]);
  expect(view.sent).toEqual([]);
  view.fixture.destroy();
});

test('an unsure route is dashed and Enter goes to chat', async () => {
  const view = composer(() => ({ intent: 'filter', confidence: 0.55 }));

  await typeAndDecide(view, 'hmm', '→ filter 0.55');
  const tone = view.element
    .querySelector('.atc-route')
    ?.getAttribute('data-tone');
  enter(view.element);
  await until(() => view.sent.length === 1);

  expect(tone).toBe('unsure');
  expect(view.filtered).toEqual([]);
  view.fixture.destroy();
});

test('an unavailable router shows a chat badge, no error, and Enter still chats', async () => {
  const view = composer(() => null);

  await typeAndDecide(view, 'hello there', '→ chat');
  enter(view.element);
  await until(() => view.sent.length === 1);

  expect(view.sent).toEqual(['hello there']);
  expect(view.element.querySelector('[role="alert"]')).toBeNull();
  view.fixture.destroy();
});

test('Enter before the router answers waits for it, then follows the route', async () => {
  let release: (() => void) | undefined;
  const view = composer(
    () =>
      new Promise((resolve) => {
        release = () => resolve({ intent: 'filter', confidence: 0.9 });
      }),
  );

  type(view.input, 'only jets');
  await until(() => release !== undefined);
  enter(view.element);
  const early = [...view.filtered];
  release?.();
  await until(() => view.filtered.length === 1);

  expect(early).toEqual([]);
  expect(view.filtered).toEqual(['only jets']);
  expect(view.sent).toEqual([]);
  view.fixture.destroy();
});

test('typing again while Enter waits cancels that submission', async () => {
  vi.useFakeTimers();
  try {
    const view = composer(() => new Promise(() => undefined));
    type(view.input, 'first');
    enter(view.element);

    type(view.input, 'first, then more');
    await vi.advanceTimersByTimeAsync(1500);

    expect(view.sent).toEqual([]);
    expect(view.input.value).toBe('first, then more');
    view.fixture.destroy();
  } finally {
    vi.useRealTimers();
  }
});

test('with no answer after 1000 ms Enter goes to chat', async () => {
  vi.useFakeTimers();
  try {
    const view = composer(() => new Promise(() => undefined));
    type(view.input, 'hello');

    enter(view.element);
    await vi.advanceTimersByTimeAsync(999);
    const early = [...view.sent];
    await vi.advanceTimersByTimeAsync(2);

    expect(early).toEqual([]);
    expect(view.sent).toEqual(['hello']);
    view.fixture.destroy();
  } finally {
    vi.useRealTimers();
  }
});

test('destroying while Enter waits leaves nothing to fire', async () => {
  vi.useFakeTimers();
  try {
    const view = composer(() => new Promise(() => undefined));
    type(view.input, 'hello');
    enter(view.element);
    await vi.advanceTimersByTimeAsync(200);

    view.fixture.destroy();
    const timers = vi.getTimerCount();
    await vi.advanceTimersByTimeAsync(2000);

    expect(timers).toBe(0);
    expect(view.sent).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});

test('the badge is described to the input and shows no route for empty text', async () => {
  const view = composer();

  const idle = text(view.element.querySelector('.atc-route'));
  await typeAndDecide(view, 'hello', '→ chat 0.90');
  const badge = view.element.querySelector('.atc-route') as HTMLElement;

  expect(idle).toBe('');
  expect(view.input.getAttribute('aria-describedby')).toBe(badge.id);
  expect(badge.getAttribute('data-tone')).toBe('chat');
  view.fixture.destroy();
});

test('starters go straight to their route', () => {
  setup();
  const fixture = TestBed.createComponent(EmptyState);
  const picked: Starter[] = [];
  fixture.componentInstance.pick.subscribe((starter) => picked.push(starter));
  fixture.detectChanges();

  const buttons = [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll('button'),
  ];
  buttons.at(-1)?.click();
  buttons[0]?.click();

  expect(picked.map((starter) => starter.route)).toEqual(['filter', 'chat']);
});

test('a running step shows as one shimmering line, then folds into a summary that expands to every step', () => {
  setup();
  const fixture = TestBed.createComponent(ToolChips);
  const element = fixture.nativeElement as HTMLElement;
  const find = {
    name: 'findAircraft',
    args: { approaching: 'KSEA', sortBy: 'distance' },
    status: 'pending' as const,
  };
  const highlight = {
    name: 'highlightAircraft',
    args: { hexes: ['a', 'b', 'c'] },
    status: 'pending' as const,
  };
  const live = () =>
    [...element.querySelectorAll('[data-testid="tool-current"]')].map(
      (line) => ({
        text: text(line),
        spinner: line.querySelector('.atc-tool-spinner') !== null,
        shimmer: line.querySelector('.atc-shimmer') !== null,
      }),
    );
  const summary = () =>
    element.querySelector<HTMLButtonElement>('[data-testid="tool-summary"]');

  fixture.componentRef.setInput('calls', [find, highlight]);
  fixture.componentRef.setInput('busy', true);
  fixture.detectChanges();
  const running = live();
  const before = summary();
  fixture.componentRef.setInput('calls', [
    { ...find, status: 'done', result: { status: 'fulfilled' } },
    { ...highlight, status: 'done', result: { status: 'rejected' } },
  ]);
  fixture.componentRef.setInput('busy', false);
  fixture.detectChanges();
  const collapsed = summary()?.getAttribute('aria-expanded');
  summary()?.click();
  fixture.detectChanges();
  const steps = [...element.querySelectorAll('[data-testid="tool-step"]')].map(
    (step) => [step.getAttribute('data-state'), text(step)],
  );

  expect(running).toEqual([
    { text: 'Highlighting 3 aircraft…', spinner: true, shimmer: true },
  ]);
  expect(before).toBeNull();
  expect(live()).toEqual([]);
  expect(text(summary())).toBe('Searched traffic, 1 failed · 2 steps');
  expect(collapsed).toBe('false');
  expect(summary()?.getAttribute('aria-expanded')).toBe('true');
  expect(steps).toEqual([
    ['done', 'Finding aircraft approaching Seattle'],
    ['failed', 'Highlighting 3 aircraft (failed)'],
  ]);
});

test('consecutive tool calls fold into one activity line in a polite live region', () => {
  setup();
  const fixture = TestBed.createComponent(Transcript);
  const items = transcriptItems([
    { role: 'user' as const, content: 'Seattle?' },
    {
      role: 'assistant' as const,
      toolCalls: [{ name: 'findAircraft', args: {}, status: 'done' as const }],
    },
    {
      role: 'assistant' as const,
      toolCalls: [
        { name: 'clearHighlight', args: {}, status: 'pending' as const },
      ],
    },
  ]);

  fixture.componentRef.setInput('items', items);
  fixture.componentRef.setInput('busy', true);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const list = element.querySelector('ol');
  const current = element.querySelector('[data-testid="tool-current"]');
  const status = element.querySelector('[data-testid="chat-status"]');

  expect(element.querySelectorAll('atc-tool-chips')).toHaveLength(1);
  expect(element.querySelector('[data-testid="tool-summary"]')).toBeNull();
  expect(text(current)).toBe('Clearing the highlight…');
  expect(current?.hasAttribute('aria-live')).toBe(false);
  expect(element.querySelector('[data-testid="thinking"]')).toBeNull();
  expect(list?.getAttribute('aria-live')).toBe('polite');
  expect(list?.getAttribute('aria-busy')).toBe('true');
  expect(status?.getAttribute('role')).toBe('status');
  expect(status?.closest('[aria-busy]')).toBeNull();
  expect(status?.classList.contains('atc-visually-hidden')).toBe(true);
  expect(text(status)).toBe('Clearing the highlight…');
});

test('a thinking line shimmers after the question until something else shows work', () => {
  setup();
  const fixture = TestBed.createComponent(Transcript);
  const element = fixture.nativeElement as HTMLElement;
  fixture.componentRef.setInput(
    'items',
    transcriptItems([{ role: 'user', content: 'Seattle?' }]),
  );
  fixture.componentRef.setInput('busy', true);

  fixture.detectChanges();
  const thinking = element.querySelector('[data-testid="thinking"]');
  const status = element.querySelector('[data-testid="chat-status"]');
  const announced = text(status);
  fixture.componentRef.setInput('busy', false);
  fixture.detectChanges();

  expect(text(thinking)).toBe('Thinking…');
  expect(thinking?.querySelector('.atc-shimmer')).not.toBeNull();
  expect(element.querySelector('[data-testid="thinking"]')).toBeNull();
  expect(announced).toBe('Thinking…');
  expect(element.querySelector('[data-testid="chat-status"]')).toBe(status);
  expect(text(status)).toBe('');
});

test('reasoning shimmers while it streams and collapses to Reasoned once done', () => {
  setup();
  const fixture = TestBed.createComponent(Transcript);
  const element = fixture.nativeElement as HTMLElement;
  const messages = [
    { role: 'user', content: 'Highest?' },
    { role: 'assistant', reasoning: 'Comparing altitudes.' },
  ];
  fixture.componentRef.setInput('items', transcriptItems(messages, true));
  fixture.componentRef.setInput('busy', true);

  fixture.detectChanges();
  const streaming = element.querySelector('[data-testid="reasoning"]');
  const label = text(streaming?.querySelector('.atc-shimmer'));
  const body = text(streaming?.querySelector('.atc-reasoning-text'));
  const thinking = element.querySelector('[data-testid="thinking"]');
  const announced = text(element.querySelector('[data-testid="chat-status"]'));
  fixture.componentRef.setInput('items', transcriptItems(messages, false));
  fixture.componentRef.setInput('busy', false);
  fixture.detectChanges();
  const done = element.querySelector('[data-testid="reasoning"]');

  expect(streaming?.classList.contains('atc-reasoning')).toBe(true);
  expect(label).toBe('Reasoning');
  expect(body).toBe('Comparing altitudes.');
  expect(thinking).toBeNull();
  expect(announced).toBe('Reasoning…');
  expect(done?.querySelector('.atc-shimmer')).toBeNull();
  expect(done?.querySelector('details')?.open).toBe(false);
  expect(text(done?.querySelector('summary'))).toBe('Reasoned');
  expect(text(done?.querySelector('details .atc-reasoning-text'))).toBe(
    'Comparing altitudes.',
  );
});

test('the header button toggles dev mode on phones', () => {
  setup();
  const fixture = TestBed.createComponent(PanelHeader);
  const toggled: string[] = [];
  fixture.componentRef.setInput('devMode', true);
  fixture.componentInstance.toggleDevMode.subscribe(() =>
    toggled.push('toggle'),
  );
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const button = element.querySelector('.atc-header-dev') as HTMLButtonElement;

  button.click();

  expect(button.getAttribute('aria-label')).toBe('Developer tools');
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(button.getAttribute('data-testid')).toBe('dev-toggle-header');
  expect(toggled).toEqual(['toggle']);
  expect(text(element)).not.toContain('Show the stream');
  expect(element.querySelector('[role="switch"]')).toBeNull();
});

test('tool lines never show arguments', () => {
  setup();
  const chips = TestBed.createComponent(ToolChips);
  chips.componentRef.setInput('calls', [
    {
      name: 'findAircraft',
      args: { near: 'KSEA' },
      status: 'done',
      result: { status: 'fulfilled' },
    },
  ]);

  chips.detectChanges();
  const element = chips.nativeElement as HTMLElement;

  expect(text(element)).not.toContain('KSEA');
  expect(element.querySelectorAll('[class*="atc-stream"]')).toHaveLength(0);
});
