import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { KeyboardInset } from './keyboard-inset';

@Component({
  imports: [KeyboardInset],
  template: `<div atcKeyboardInset></div>`,
})
class Host {}

test('the keyboard inset follows visualViewport through a host style binding', () => {
  const viewport = Object.assign(new EventTarget(), {
    height: 800,
    offsetTop: 0,
  });
  Object.defineProperty(window, 'visualViewport', {
    value: viewport,
    configurable: true,
  });
  Object.defineProperty(window, 'innerHeight', {
    value: 800,
    configurable: true,
  });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const div = (fixture.nativeElement as HTMLElement).querySelector(
    'div',
  ) as HTMLElement;

  const before = div.style.getPropertyValue('--atc-kb');
  viewport.height = 500;
  viewport.dispatchEvent(new Event('resize'));
  fixture.detectChanges();

  expect([before, div.style.getPropertyValue('--atc-kb')]).toEqual([
    '0px',
    '300px',
  ]);
});
