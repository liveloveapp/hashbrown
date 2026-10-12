import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { expect, test } from 'vitest';
import { AutoScroll } from './auto-scroll';

@Component({
  imports: [AutoScroll],
  template: '<div atcAutoScroll class="scroller"></div>',
})
class AutoScrollHost {}

function scroller() {
  const fixture = TestBed.createComponent(AutoScrollHost);
  fixture.detectChanges();
  const element = (fixture.nativeElement as HTMLElement).querySelector(
    '.scroller',
  ) as HTMLElement;
  Object.defineProperty(element, 'scrollHeight', { value: 1000 });
  Object.defineProperty(element, 'clientHeight', { value: 500 });

  return element;
}

async function append(element: HTMLElement, node: Element) {
  element.append(node);
  await new Promise((resolve) => setTimeout(resolve));
}

function row(className: string): HTMLElement {
  const element = document.createElement('p');
  element.className = className;
  return element;
}

test('streamed content scrolls to the newest row while the user is at the end', async () => {
  const element = scroller();
  element.scrollTop = 0;

  await append(element, row('atc-prose'));

  expect(element.scrollTop).toBe(1000);
});

test('a user who scrolled up is not yanked down, until they send a message', async () => {
  const element = scroller();
  element.scrollTop = 100;
  element.dispatchEvent(new Event('scroll'));

  await append(element, row('atc-prose'));
  const stayed = element.scrollTop;
  const li = document.createElement('li');
  li.append(row('atc-user'));
  await append(element, li);

  expect(stayed).toBe(100);
  expect(element.scrollTop).toBe(1000);
});

test('an empty chat is not scrolled, so the headline and starters stay in view', async () => {
  const element = scroller();
  element.scrollTop = 0;

  await append(element, row('atc-empty'));

  expect(element.scrollTop).toBe(0);
});
