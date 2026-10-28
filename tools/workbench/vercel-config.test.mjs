import assert from 'node:assert/strict';
import test from 'node:test';

import { workbenchVercelConfig } from './vercel-config.mjs';

test('every response allows framing only by the docs origins', () => {
  const arrange = workbenchVercelConfig;

  const config = arrange();

  assert.deepEqual(config.routes[0], {
    src: '^/(.*)$',
    headers: {
      'Content-Security-Policy':
        'frame-ancestors https://hashbrown.dev https://www.hashbrown.dev https://*.vercel.app http://localhost:*',
    },
    continue: true,
  });
});

test('keeps the root redirect and api rewrite', () => {
  const arrange = workbenchVercelConfig;

  const config = arrange();

  assert.equal(config.version, 3);
  assert.deepEqual(config.routes.slice(1), [
    { src: '^/$', status: 307, headers: { Location: '/react.html' } },
    { src: '^/api/workbench(?:/.*)?$', dest: '/api/workbench' },
  ]);
});
