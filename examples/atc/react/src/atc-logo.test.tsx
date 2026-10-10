import { cleanup, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { AtcLogo } from './atc-logo';

test('the logo renders the three letter strokes with an ATC label', () => {
  cleanup();

  render(<AtcLogo />);
  const svg = screen.getByRole('img', { name: 'ATC' });

  expect(svg.getAttribute('height')).toBe('18');
  expect(svg.querySelectorAll('path')).toHaveLength(3);
});

test('the logo height follows its prop', () => {
  cleanup();

  render(<AtcLogo height={32} />);

  expect(screen.getByRole('img', { name: 'ATC' }).getAttribute('height')).toBe(
    '32',
  );
});
