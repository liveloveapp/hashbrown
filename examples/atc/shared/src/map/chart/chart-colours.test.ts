// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { chartColours } from './chart-colours';

test('reads the chart colours from custom properties', () => {
  const element = document.createElement('div');
  element.style.setProperty('--atc-chart-blue', ' #111111');
  element.style.setProperty('--atc-chart-magenta', '#222222');
  element.style.setProperty('--atc-diagram-pavement', '#333333');
  element.style.setProperty('--atc-diagram-hotspot', '#444444');
  element.style.setProperty('--atc-ink', '#555555');
  document.body.append(element);

  const colours = chartColours(element);

  expect(colours).toEqual({
    blue: '#111111',
    magenta: '#222222',
    pavement: '#333333',
    hotspot: '#444444',
    ink: '#555555',
  });
  element.remove();
});

test('an unset colour falls back to currentColor', () => {
  const element = document.createElement('div');

  const colours = chartColours(element);

  expect(colours.blue).toBe('currentColor');
  expect(colours.ink).toBe('currentColor');
});
