import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AutoScrollDirective } from './auto-scroll';
import { SheetHandleComponent } from './sheet-handle';

function pointer(type: string, clientY: number): Event {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { clientY, pointerId: 1 });
  return event;
}

function handle() {
  const fixture = TestBed.createComponent(SheetHandleComponent);
  fixture.detectChanges();
  const button = (fixture.nativeElement as HTMLElement).querySelector(
    'button',
  ) as HTMLButtonElement;

  return { fixture, button };
}

test('the sheet handle is a button that reports and toggles aria-expanded', () => {
  const { fixture, button } = handle();

  const before = button.getAttribute('aria-expanded');
  button.click();
  fixture.detectChanges();
  const opened = button.getAttribute('aria-expanded');
  button.click();
  fixture.detectChanges();

  expect([before, opened, button.getAttribute('aria-expanded')]).toEqual([
    'false',
    'true',
    'false',
  ]);
  expect(button.getAttribute('aria-label')).toBe('Expand chat');
  expect(button.getAttribute('aria-controls')).toBe('atc-chat-sheet');
});

test('dragging the handle up opens the sheet without a second toggle from the click', () => {
  const { fixture, button } = handle();

  button.dispatchEvent(pointer('pointerdown', 700));
  button.dispatchEvent(pointer('pointerup', 600));
  button.click();
  fixture.detectChanges();

  expect(fixture.componentInstance.expanded()).toBe(true);
  expect(button.getAttribute('aria-expanded')).toBe('true');
});

test('dragging the handle down closes an open sheet', () => {
  const { fixture, button } = handle();
  fixture.componentInstance.expanded.set(true);

  button.dispatchEvent(pointer('pointerdown', 300));
  button.dispatchEvent(pointer('pointerup', 420));
  button.click();
  fixture.detectChanges();

  expect(fixture.componentInstance.expanded()).toBe(false);
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
