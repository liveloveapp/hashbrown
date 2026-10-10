import {
  type Aircraft,
  createAtcStore,
  SELECTED_PROMPT,
  SOURCE_URLS,
  STARTER_PROMPTS,
  transcriptItems,
} from '@atc/shared';
import { TestBed } from '@angular/core/testing';
import { ComposerComponent } from './composer';
import { EmptyStateComponent } from './empty-state';
import { FeedBadgeComponent } from './feed-badge';
import { PanelHeaderComponent } from './panel-header';
import { ToolChipsComponent } from './tool-chips';
import { TranscriptComponent } from './transcript';
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

test('the header shows the mark, the Hashbrown credit and a connecting chip', () => {
  setup();

  const fixture = TestBed.createComponent(PanelHeaderComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;

  expect(element.querySelector('[aria-label="ATC"]')).not.toBeNull();
  expect(text(element)).toContain('built with Hashbrown');
  expect(text(element.querySelector('[role="status"]'))).toBe('Connecting…');
});

test('the status chip counts live aircraft beside a solid dot', () => {
  const store = setup();
  const fixture = TestBed.createComponent(FeedBadgeComponent);

  store.setFeedStatus('live');
  store.applySnapshot({
    at: 1,
    aircraft: [plane, { ...plane, hex: 'bbbbbb' }],
  });
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const chip = element.querySelector('.atc-chip');
  const status = element.querySelector('[role="status"]');

  expect(text(chip)).toBe('Live · 2 aircraft');
  expect(text(status)).toBe('Live');
  expect(chip?.querySelector('.atc-chip-dot:not(.is-hollow)')).not.toBeNull();
});

test('the status chip shows a hollow dot while connecting or delayed', () => {
  const store = setup();
  const fixture = TestBed.createComponent(FeedBadgeComponent);

  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const connecting = element.querySelector('.atc-chip-dot.is-hollow');
  store.setFeedStatus('delayed');
  fixture.detectChanges();

  expect(connecting).not.toBeNull();
  expect(text(element.querySelector('.atc-chip'))).toBe('Data delayed');
  expect(element.querySelector('.atc-chip-dot.is-hollow')).not.toBeNull();
});

test('the empty state asks a question and offers every starter prompt', () => {
  setup();
  const fixture = TestBed.createComponent(EmptyStateComponent);
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
  const fixture = TestBed.createComponent(EmptyStateComponent);

  store.select('aaaaaa');
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const buttons = [...element.querySelectorAll('button')];

  expect(buttons.map((button) => text(button))).toEqual([
    SELECTED_PROMPT,
    ...STARTER_PROMPTS,
  ]);
});

test('tool calls run live, then fold into one summary that expands to every step', () => {
  setup();
  const fixture = TestBed.createComponent(ToolChipsComponent);
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
    [...element.querySelectorAll('[data-testid="tool-chip"]')].map((chip) => ({
      text: text(chip),
      spinner: chip.querySelector('.atc-tool-spinner') !== null,
    }));
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
    { text: 'Finding aircraft · approaching KSEA', spinner: true },
    { text: 'Highlighting 3 aircraft', spinner: true },
  ]);
  expect(before).toBeNull();
  expect(live()).toEqual([]);
  expect(text(summary())).toBe('Searched traffic, 1 failed');
  expect(collapsed).toBe('false');
  expect(summary()?.getAttribute('aria-expanded')).toBe('true');
  expect(steps).toEqual([
    ['done', 'Finding aircraft · approaching KSEA'],
    ['failed', 'Highlighting 3 aircraft · failed'],
  ]);
});

function composer() {
  setup();
  const fixture = TestBed.createComponent(ComposerComponent);
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

test('consecutive tool calls fold into one row in a polite live region', () => {
  setup();
  const fixture = TestBed.createComponent(TranscriptComponent);
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
  expect(text(element.querySelector('[data-testid="tool-summary"]'))).toBe(
    'Searched traffic',
  );
  expect(
    [...element.querySelectorAll('[data-testid="tool-chip"]')].map((chip) =>
      text(chip),
    ),
  ).toEqual(['Clearing the highlight']);
  expect(list?.getAttribute('aria-live')).toBe('polite');
  expect(list?.getAttribute('aria-busy')).toBe('true');
});

test('the composer keeps a footnote link to the core file', () => {
  const { fixture } = composer();

  const link = (fixture.nativeElement as HTMLElement).querySelector('a');

  expect(text(link)).toBe('View the core file');
  expect(link?.getAttribute('href')).toBe(SOURCE_URLS.angular);
  fixture.destroy();
});
