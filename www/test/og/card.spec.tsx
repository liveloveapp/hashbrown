import { expect, test } from 'vitest';
import { renderCard } from '../../src/lib/og/card';

async function pngSize(response: Response) {
  const view = new DataView(await response.arrayBuffer());
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

test('renders a 1200x630 PNG card', async () => {
  const card = { title: 'Structured Output', subtitle: ['React docs · hashbrown.dev'] };

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
