import {
  type Aircraft,
  createAtcStore,
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
  callsign: 'UAL100',
  typeCode: 'B39M',
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

test('the status chip counts live aircraft and shows a dot only when live', () => {
  const store = setup();
  const fixture = TestBed.createComponent(FeedBadgeComponent);

  store.setFeedStatus('live');
  store.applySnapshot({
    at: 1,
    aircraft: [plane, { ...plane, hex: 'bbbbbb' }],
  });
  fixture.detectChanges();
  const chip = (fixture.nativeElement as HTMLElement).querySelector(
    '[role="status"]',
  );

  expect(text(chip)).toBe('Live · 2 aircraft');
  expect(chip?.querySelector('.atc-chip-dot')).not.toBeNull();
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

test('tool chips spin while running, then settle as done or failed', () => {
  setup();
  const fixture = TestBed.createComponent(ToolChipsComponent);
  const find = {
    name: 'findAircraft',
    args: { approaching: 'SEA', sortBy: 'distance' },
    status: 'pending' as const,
  };
  const highlight = {
    name: 'highlightAircraft',
    args: { hexes: ['a', 'b', 'c'] },
    status: 'pending' as const,
  };
  const chips = () =>
    [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll(
        '[data-testid="tool-chip"]',
      ),
    ].map((chip) => ({
      state: chip.getAttribute('data-state'),
      text: text(chip),
      spinner: chip.querySelector('.atc-tool-spinner') !== null,
    }));

  fixture.componentRef.setInput('calls', [find, highlight]);
  fixture.componentRef.setInput('busy', true);
  fixture.detectChanges();
  const running = chips();
  fixture.componentRef.setInput('calls', [
    find,
    { ...highlight, status: 'done', result: { status: 'rejected' } },
  ]);
  fixture.detectChanges();
  const outOfOrder = chips();
  fixture.componentRef.setInput('busy', false);
  fixture.detectChanges();
  const settled = chips();

  expect(running).toEqual([
    {
      state: 'running',
      text: 'findAircraft · approaching SEA',
      spinner: true,
    },
    {
      state: 'running',
      text: 'highlightAircraft · 3 aircraft',
      spinner: true,
    },
  ]);
  expect(outOfOrder.map((chip) => chip.state)).toEqual(['running', 'failed']);
  expect(outOfOrder[1]?.spinner).toBe(false);
  expect(settled.map((chip) => [chip.state, chip.spinner])).toEqual([
    ['stopped', false],
    ['failed', false],
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

test('consecutive tool calls render as one chip row in a polite live region', () => {
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
  expect(
    [...element.querySelectorAll('[data-testid="tool-chip"]')].map((chip) =>
      chip.getAttribute('data-state'),
    ),
  ).toEqual(['done', 'running']);
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
