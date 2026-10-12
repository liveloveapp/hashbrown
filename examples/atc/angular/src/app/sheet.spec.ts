import {
  focusOpensSheet,
  INITIAL_SHEET,
  nextSheet,
  type SheetEvent,
  sheetExpanded,
} from '@atc/shared';
import { Component, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Composer } from './composer';
import { SheetHandle } from './sheet-handle';

function pointer(type: string, clientY: number): Event {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { clientY, pointerId: 1 });
  return event;
}

/** A sheet like the app's: the handle and a text field drive `nextSheet`. */
@Component({
  imports: [SheetHandle],
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

/** The app's sheet around the real composer: focus opens it, sending lowers it. */
@Component({
  imports: [Composer],
  template: `
    <section [attr.data-snap]="sheet().snap" (focusin)="focus($event)">
      <atc-composer (send)="move({ type: 'send' })" />
    </section>
  `,
})
class ComposerSheetHost {
  readonly sheet = signal(INITIAL_SHEET);
  move(event: SheetEvent): void {
    this.sheet.update((sheet) => nextSheet(sheet, event));
  }
  focus(event: FocusEvent): void {
    if (focusOpensSheet(event.target)) {
      this.move({ type: 'focus' });
    }
  }
}

test('tapping Send lowers the sheet to half, though the composer takes focus back', () => {
  const fixture = TestBed.createComponent(ComposerSheetHost);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  document.body.append(element);
  const field = element.querySelector('input') as HTMLInputElement;
  const send = element.querySelector('.atc-send') as HTMLButtonElement;
  field.focus();
  field.value = "What's flying near Seattle?";
  // A tap moves focus to the Send button before it submits.
  send.focus();

  send.click();
  fixture.detectChanges();

  expect(fixture.componentInstance.sheet().snap).toBe('half');
  expect(document.activeElement).toBe(field);
  element.remove();
});
