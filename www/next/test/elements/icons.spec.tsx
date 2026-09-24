import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import {
  BoltIcon,
  DatabaseCogIcon,
  MessageIcon,
} from '../../src/components/icons';

test('renders the database-cog, message and bolt icons as SVGs', () => {
  const icons = [DatabaseCogIcon, MessageIcon, BoltIcon];

  const html = icons.map((Icon) => renderToStaticMarkup(<Icon />));

  for (const svg of html) {
    expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 24 24"/);
    expect(svg).toContain('<path');
  }
});
