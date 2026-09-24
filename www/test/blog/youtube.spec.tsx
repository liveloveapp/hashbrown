import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { Youtube, youtubeVideoId } from '../../src/components/blog/Youtube';

test.each([
  ['https://www.youtube.com/embed/Vd2WLQ8vqfU', 'Vd2WLQ8vqfU'],
  ['https://www.youtube.com/watch?v=Vd2WLQ8vqfU', 'Vd2WLQ8vqfU'],
  ['https://www.youtube.com/live/Vd2WLQ8vqfU', 'Vd2WLQ8vqfU'],
  ['https://youtu.be/Vd2WLQ8vqfU', 'Vd2WLQ8vqfU'],
  ['https://example.com/video', undefined],
])('youtubeVideoId(%s) is %s', (src, expected) => {
  const input = src;

  const id = youtubeVideoId(input);

  expect(id).toBe(expected);
});

test('the embed renders a lazy iframe', () => {
  const src = 'https://www.youtube.com/watch?v=Vd2WLQ8vqfU';

  const html = renderToStaticMarkup(<Youtube src={src} title="A talk" />);

  expect(html).toContain('src="https://www.youtube.com/embed/Vd2WLQ8vqfU"');
  expect(html).toContain('title="A talk"');
  expect(html).toContain('width="100%"');
  expect(html).toContain('loading="lazy"');
  expect(html).toContain(
    'allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"',
  );
});

test('the embed title defaults to YouTube Video', () => {
  const src = 'https://youtu.be/abc';

  const html = renderToStaticMarkup(<Youtube src={src} />);

  expect(html).toContain('title="YouTube Video"');
});
