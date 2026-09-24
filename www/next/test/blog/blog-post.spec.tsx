import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import BlogPostPage, {
  dynamicParams,
  generateMetadata,
  generateStaticParams,
} from '../../src/app/blog/[slug]/page';
import { listBlogPosts, readBlogPost } from '../../src/lib/content';

const render = async (slug: string) =>
  renderToStaticMarkup(
    await BlogPostPage({ params: Promise.resolve({ slug }) }),
  );

test('blog posts carry team and youtube from frontmatter', () => {
  const slug = '2025-06-05-angular-air';

  const post = readBlogPost(slug);

  expect(post?.team).toEqual(['brian']);
  expect(post?.youtube).toBe('https://www.youtube.com/watch?v=Vd2WLQ8vqfU');
});

test('a post page renders title, date, team byline and body', async () => {
  const slug = '2025-06-25-hashbrown-launch';

  const html = await render(slug);

  expect(html).toContain('<h1>Introducing Hashbrown</h1>');
  expect(html).toContain('<time dateTime="2025-06-25">Jun 25, 2025</time>');
  expect(html).toContain('src="/image/team/brian.png"');
  expect(html).toContain('src="/image/team/mike.png"');
  expect(html).toContain('<article');
  expect(html).not.toContain('<iframe');
});

test('a post page embeds the youtube video when the post has one', async () => {
  const slug = '2025-06-05-angular-air';

  const html = await render(slug);

  const iframe = html.match(/<iframe[^>]*>/)?.[0];
  expect(iframe).toContain('src="https://www.youtube.com/embed/Vd2WLQ8vqfU"');
  expect(iframe).toContain('title="Hashbrown on Angular Air"');
});

test('a post page body renders markdown with site elements', async () => {
  const slug = '2026-09-23-hashbrown-v-0-6-0';

  const html = await render(slug);

  expect(html).toContain('Today we are releasing Hashbrown v0.6.');
  expect(html).not.toContain('data-unported');
});

test('every post pre-renders and unknown slugs 404', () => {
  const posts = listBlogPosts();

  const params = generateStaticParams();

  expect(params).toEqual(posts.map(({ slug }) => ({ slug })));
  expect(dynamicParams).toBe(false);
});

test('post metadata uses the post title, description, image and date', async () => {
  const slug = '2026-09-23-hashbrown-v-0-6-0';

  const meta = await generateMetadata({ params: Promise.resolve({ slug }) });

  const og = meta.openGraph as {
    type?: string;
    publishedTime?: string;
    images?: unknown;
  };
  expect(meta.title).toBe('Hashbrown v0.6 speaks AG-UI end to end');
  expect(og.type).toBe('article');
  expect(og.publishedTime).toBe('2026-09-23');
  expect(og.images).toEqual([
    readBlogPost(slug)?.ogImage ??
      'https://hashbrown.dev/image/meta/og-default.png',
  ]);
});
