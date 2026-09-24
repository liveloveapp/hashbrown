// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { expect, test } from 'vitest';
import { BackendCodeExample } from '../../src/components/elements/BackendCodeExample';
import { renderMarkdown } from '../../src/lib/markdown';

const md = [
  '<hb-backend-code-example>',
  '',
  '<div backend="express">',
  '',
  '```ts',
  'const app = express();',
  '```',
  '',
  '</div>',
  '',
  '<div backend="fastify">',
  '',
  '```ts',
  'const fastify = Fastify();',
  '```',
  '',
  '</div>',
  '',
  '</hb-backend-code-example>',
].join('\n');

const renderExample = async () =>
  (await renderMarkdown(md, { 'hb-backend-code-example': BackendCodeExample }))
    .content;

const reset = () => {
  cleanup();
  localStorage.clear();
  document.body.innerHTML = '';
};

test('server-renders the default backend selected, with a tab per backend', async () => {
  reset();
  const tree = await renderExample();

  const html = renderToString(tree);

  expect(html).toContain('data-component="backend-code-example"');
  expect(html).toContain('data-backend="express"');
  expect(html).toContain('class="shiki hashbrown"');
  expect(html).toContain('express');
  for (const label of ['Express', 'Fastify', 'Nestjs', 'Hono']) {
    expect(html).toContain(`aria-label="Switch To ${label}"`);
  }
  expect(html).toMatch(/aria-pressed="true"[^>]*>Express</);
});

test('selecting a tab switches the backend and persists it in the Angular config shape', async () => {
  reset();
  localStorage.setItem(
    'config',
    JSON.stringify({ sdk: 'react', provider: 'google', backend: 'express' }),
  );
  const { container, getByRole } = render(await renderExample());

  fireEvent.click(getByRole('button', { name: 'Switch To Fastify' }));

  expect(
    container.querySelector('[data-backend]')?.getAttribute('data-backend'),
  ).toBe('fastify');
  expect(JSON.parse(localStorage.getItem('config') ?? 'null')).toEqual({
    sdk: 'react',
    provider: 'google',
    backend: 'fastify',
  });
});

test('hydrates the server markup without mismatch, then shows the stored backend', async () => {
  reset();
  localStorage.setItem(
    'config',
    JSON.stringify({ sdk: 'angular', provider: 'openai', backend: 'hono' }),
  );
  const tree = await renderExample();
  const host = document.createElement('div');
  host.innerHTML = renderToString(tree);
  document.body.append(host);
  const errors: unknown[] = [];

  await act(async () => {
    hydrateRoot(host, tree, { onRecoverableError: (e) => errors.push(e) });
  });

  expect(errors).toEqual([]);
  expect(
    host.querySelector('[data-backend]')?.getAttribute('data-backend'),
  ).toBe('hono');
});

test('hides the copy button when copyable is "false"', () => {
  reset();

  const { queryByRole } = render(
    <BackendCodeExample copyable="false">
      <div>code</div>
    </BackendCodeExample>,
  );

  expect(queryByRole('button', { name: 'Copy code to clipboard' })).toBeNull();
});
