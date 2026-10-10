import {
  focusOpensSheet,
  INITIAL_SHEET,
  nextSheet,
  type SheetEvent,
  sheetExpanded,
} from '@atc/shared';
import { Component, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AutoScrollDirective } from './auto-scroll';
import { SheetHandleComponent } from './sheet-handle';

function pointer(type: string, clientY: number): Event {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { clientY, pointerId: 1 });
  return event;
}

/** A sheet like the app's: the handle and a text field drive `nextSheet`. */
@Component({
  imports: [SheetHandleComponent],
  template: `
    <section [attr.data-snap]="sheet().snap" (focusin)="focus($event)">
      <atc-sheet-handle [expanded]="expanded()" (moved)="move($event)" />
      <input aria-label="Message" />
    </section>
  `,
})
class SheetHost {
  readonly sheet = signal(INITIAL_SHEET);
  readonly expanded = computed(() => sheetExpanded(this.sheet()));
  move(event: SheetEvent): void {
    this.sheet.update((sheet) => nextSheet(sheet, event));
  }
  focus(event: FocusEvent): void {
    if (focusOpensSheet(event.target)) {
      this.move({ type: 'focus' });
    }
  }
}

function handle() {
  const fixture = TestBed.createComponent(SheetHost);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const button = element.querySelector('button') as HTMLButtonElement;
  const snap = () => {
    fixture.detectChanges();
    return fixture.componentInstance.sheet().snap;
  };

  return { fixture, button, snap, element };
}

test('the sheet handle is a button that reports and toggles aria-expanded', () => {
  const { fixture, button } = handle();

  const before = button.getAttribute('aria-expanded');
  button.click();
  fixture.detectChanges();
  const opened = button.getAttribute('aria-expanded');
  const label = button.getAttribute('aria-label');
  button.click();
  fixture.detectChanges();

  expect([before, opened, button.getAttribute('aria-expanded')]).toEqual([
    'false',
    'true',
    'false',
  ]);
  expect(label).toBe('Collapse chat');
  expect(button.getAttribute('aria-label')).toBe('Expand chat');
  expect(button.getAttribute('aria-controls')).toBe('atc-chat-sheet');
});

test('dragging the handle up moves the sheet one snap, without a second toggle from the click', () => {
  const { button, snap } = handle();

  button.dispatchEvent(pointer('pointerdown', 700));
  button.dispatchEvent(pointer('pointerup', 600));
  button.click();
  const first = snap();
  button.dispatchEvent(pointer('pointerdown', 700));
  button.dispatchEvent(pointer('pointerup', 600));
  button.click();

  expect([first, snap()]).toEqual(['half', 'full']);
  expect(button.getAttribute('aria-expanded')).toBe('true');
});

test('dragging the handle down lowers an open sheet one snap', () => {
  const { fixture, button, snap } = handle();
  fixture.componentInstance.sheet.set({ snap: 'full', held: true });

  button.dispatchEvent(pointer('pointerdown', 300));
  button.dispatchEvent(pointer('pointerup', 420));
  button.click();

  expect(snap()).toBe('half');
});

@Component({
  imports: [AutoScrollDirective],
  template: '<div atcAutoScroll class="scroller"></div>',
})
class Host {}

function scroller() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const element = (fixture.nativeElement as HTMLElement).querySelector(
    '.scroller',
  ) as HTMLElement;
  Object.defineProperty(element, 'scrollHeight', { value: 1000 });
  Object.defineProperty(element, 'clientHeight', { value: 500 });

  return element;
}

async function append(element: HTMLElement, className: string) {
  const row = document.createElement('p');
  row.className = className;
  element.append(row);
  await new Promise((resolve) => setTimeout(resolve));
}

test('streamed content scrolls to the newest row while the user is at the end', async () => {
  const element = scroller();
  element.scrollTop = 0;

  await append(element, 'atc-prose');

  expect(element.scrollTop).toBe(1000);
});

test('a user who scrolled up is not yanked down, until they send a message', async () => {
  const element = scroller();
  element.scrollTop = 100;
  element.dispatchEvent(new Event('scroll'));

  await append(element, 'atc-prose');
  const stayed = element.scrollTop;
  await append(element, 'atc-user');

  expect(stayed).toBe(100);
  expect(element.scrollTop).toBe(1000);
});

test('focusing the handle does not open the sheet, so one tap opens and the next closes', () => {
  const { element, button, snap } = handle();
  document.body.append(element);
  const opened: string[] = [];

  const tap = () => {
    button.focus();
    button.click();
    opened.push(snap());
  };
  tap();
  tap();

  expect(opened).toEqual(['full', 'peek']);
  element.remove();
});

test('focusing the composer opens the sheet fully', () => {
  const { element, snap } = handle();
  document.body.append(element);

  element.querySelector('input')?.focus();

  expect(snap()).toBe('full');
  element.remove();
});

test('a user message nested in an added node still re-pins the scroller', async () => {
  const element = scroller();
  element.scrollTop = 100;
  element.dispatchEvent(new Event('scroll'));
  const li = document.createElement('li');
  li.innerHTML = '<p class="atc-user">hi</p>';

  element.append(li);
  await new Promise((resolve) => setTimeout(resolve));

  expect(element.scrollTop).toBe(1000);
});

test('an empty chat is not scrolled, so the headline and starters stay in view', async () => {
  const element = scroller();
  element.scrollTop = 0;

  await append(element, 'atc-empty');

  expect(element.scrollTop).toBe(0);
});
