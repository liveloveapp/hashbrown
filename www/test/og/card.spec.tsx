import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Card, renderCard } from '../../src/lib/og/card';
import { repoRoot } from '../../src/lib/repo-root';

async function pngSize(response: Response) {
  const view = new DataView(await response.arrayBuffer());
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

test('renders a 1200x630 PNG card', async () => {
  const card = {
    title: 'Structured Output',
    subtitle: ['React docs · hashbrown.dev'],
  };

  const response = await renderCard(card);

  expect(response.headers.get('content-type')).toBe('image/png');
  expect(await pngSize(response)).toEqual({ width: 1200, height: 630 });
});

test('renders the GitHub card at 1280x640 with the install pill', async () => {
  const card = {
    title: 'AI chat and agents for React and Angular.',
    subtitle: ['From any model.'],
    code: 'npm install @hashbrownai/react',
    size: 'github' as const,
  };

  const response = await renderCard(card);

  expect(await pngSize(response)).toEqual({ width: 1280, height: 640 });
});

test('renders the square card at 1080x1080', async () => {
  const card = {
    title: 'AI chat and agents for React and Angular.',
    subtitle: ['hashbrown.dev'],
    size: 'square' as const,
  };

  const response = await renderCard(card);

  expect(await pngSize(response)).toEqual({ width: 1080, height: 1080 });
});

function imageSources(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(imageSources);
  const element = node as { type?: unknown; props?: Record<string, unknown> };
  const own =
    element.type === 'img' && typeof element.props?.src === 'string'
      ? [element.props.src]
      : [];
  return [...own, ...imageSources(element.props?.children)];
}

test('the card shows the wordmark and the LiveLoveApp mark, not the mascot', () => {
  const card = { title: 'Structured Output', subtitle: ['React docs'] };
  const decode = (src: string) =>
    Buffer.from(src.split(',')[1], 'base64').toString('utf8');
  const wordmark = readFileSync(
    join(repoRoot(), 'www/public/image/logo/word-mark.svg'),
    'utf8',
  );
  const mascot = readFileSync(
    join(repoRoot(), 'www/public/image/logo/brand-mark.svg'),
    'utf8',
  );

  const svgs = imageSources(Card(card)).map(decode);

  expect(svgs).toContain(wordmark);
  expect(svgs).not.toContain(mascot);
});
