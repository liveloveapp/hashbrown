import {
  type Aircraft,
  ATC_SOURCE_URL,
  createAtcStore,
  SELECTED_PROMPT,
  STARTER_PROMPTS,
  transcriptItems,
} from '@atc/shared';
import { TestBed } from '@angular/core/testing';
import { Composer } from './composer';
import { EmptyState } from './empty-state';
import { PanelHeader } from './panel-header';
import { ToolChips } from './tool-chips';
import { Transcript } from './transcript';
import { ATC_STORE } from './store';

const plane: Aircraft = {
  hex: 'aaaaaa',
  label: 'UAL100',
  callsign: 'UAL100',
  registration: null,
  typeCode: 'B39M',
  category: null,
  kind: 'jet',
  lat: 47.5716,
  lon: -122.3088,
  altitudeFt: 5000,
  onGround: false,
  groundSpeedKt: 240,
  trackDeg: 180,
  verticalRateFpm: -800,
};

function setup() {
  const store = createAtcStore();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: ATC_STORE, useValue: store }],
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
  const picked: string[] = [];
  fixture.componentInstance.pick.subscribe((prompt) => picked.push(prompt));

  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const buttons = [...element.querySelectorAll('button')];
  buttons[1]?.click();

  expect(text(element.querySelector('.atc-empty-title'))).toBe(
    'Ask about the planes over the Pacific Northwest.',
  );
  expect(buttons.map((button) => text(button))).toEqual([...STARTER_PROMPTS]);
  expect(picked).toEqual([STARTER_PROMPTS[1]]);
});

test('the empty state offers the selected-plane question first while a plane is selected', () => {
  const store = setup();
  const fixture = TestBed.createComponent(EmptyState);

  store.select('aaaaaa');
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const buttons = [...element.querySelectorAll('button')];

  expect(buttons.map((button) => text(button))).toEqual([
    SELECTED_PROMPT,
    ...STARTER_PROMPTS,
  ]);
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

function composer() {
  setup();
  const fixture = TestBed.createComponent(Composer);
  const sent: string[] = [];
  fixture.componentInstance.send.subscribe((message) => sent.push(message));
  fixture.detectChanges();
  document.body.appendChild(fixture.nativeElement);
  const input = (fixture.nativeElement as HTMLElement).querySelector(
    'input',
  ) as HTMLInputElement;

  return { fixture, input, sent };
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
    if (target instanceof HTMLElement) target.focus();
    return slash(target).defaultPrevented;
  });

  expect(events).toEqual([false, false, false, false]);
  expect(document.activeElement).toBe(input);
  other.remove();
  area.remove();
  editable.remove();
  fixture.destroy();
});

test('Enter sends the trimmed draft, clears the input and keeps focus', () => {
  const { fixture, input, sent } = composer();
  input.focus();

  input.value = '  Show me Seattle  ';
  input.dispatchEvent(new Event('input'));
  (fixture.nativeElement as HTMLElement)
    .querySelector('form')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  fixture.detectChanges();

  expect(sent).toEqual(['Show me Seattle']);
  expect(input.value).toBe('');
  expect(document.activeElement).toBe(input);
  fixture.destroy();
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

  expect(element.querySelectorAll('atc-tool-chips')).toHaveLength(1);
  expect(element.querySelector('[data-testid="tool-summary"]')).toBeNull();
  expect(text(element.querySelector('[data-testid="tool-current"]'))).toBe(
    'Clearing the highlight…',
  );
  expect(element.querySelector('[data-testid="thinking"]')).toBeNull();
  expect(list?.getAttribute('aria-live')).toBe('polite');
  expect(list?.getAttribute('aria-busy')).toBe('true');
});

test('the composer has no footnote under it', () => {
  const { fixture } = composer();

  const link = (fixture.nativeElement as HTMLElement).querySelector('a');

  expect(link).toBeNull();
  fixture.destroy();
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
  fixture.componentRef.setInput('busy', false);
  fixture.detectChanges();

  expect(text(thinking)).toBe('Thinking…');
  expect(thinking?.querySelector('.atc-shimmer')).not.toBeNull();
  expect(element.querySelector('[data-testid="thinking"]')).toBeNull();
});
