import { TestBed } from '@angular/core/testing';
import { AtcLogoComponent } from './atc-logo';

test('the logo renders the three letter strokes with an ATC label', () => {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(AtcLogoComponent);

  fixture.detectChanges();
  const svg = fixture.nativeElement.querySelector('svg') as SVGElement;

  expect(svg.getAttribute('role')).toBe('img');
  expect(svg.getAttribute('aria-label')).toBe('ATC');
  expect(svg.getAttribute('height')).toBe('18');
  expect(svg.getAttribute('width')).toBe('56.25');
  expect(svg.getAttribute('stroke')).toBe('currentColor');
  expect(svg.querySelectorAll('path')).toHaveLength(3);
});

test('the logo height follows its input', () => {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(AtcLogoComponent);

  fixture.componentRef.setInput('height', 32);
  fixture.detectChanges();

  expect(
    fixture.nativeElement.querySelector('svg').getAttribute('height'),
  ).toBe('32');
});

test('the logo host is a flex box so the mark sits on the header line', () => {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(AtcLogoComponent);

  fixture.detectChanges();

  expect(
    (fixture.nativeElement as HTMLElement).classList.contains('atc-logo'),
  ).toBe(true);
});
