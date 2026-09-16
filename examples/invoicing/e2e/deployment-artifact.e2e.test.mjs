import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';

const output = new URL('../.vercel/output/', import.meta.url);

test('assembled output has the B4 function, the api function, and the SPA', async () => {
  const config = JSON.parse(
    await readFile(new URL('config.json', output), 'utf8'),
  );
  assert.equal(config.version, 3);
  assert.deepEqual(config.routes[0], { handle: 'filesystem' });
  assert.deepEqual(config.routes.at(-1), { src: '/(.*)', dest: '/index.html' });
  const b4 = JSON.parse(
    await readFile(
      new URL('functions/index.func/.vc-config.json', output),
      'utf8',
    ),
  );
  assert.equal(b4.runtime, 'nodejs24.x');
  assert.equal(b4.maxDuration, 300);
  assert.equal(b4.supportsResponseStreaming, true);
  await stat(new URL('functions/index.func/index.mjs', output));
  await stat(new URL('static/index.html', output));
});

test('the B4 function exports a web fetch app', async () => {
  const { default: app } = await import(
    new URL('functions/index.func/index.mjs', output)
  );
  assert.equal(typeof app.fetch, 'function');
});

test('the api function serves a seeded snapshot and sets the session cookie', async () => {
  delete process.env.DATABASE_URL; // memory repositories for the artifact test
  const { default: handler } = await import(
    new URL('functions/api.func/index.mjs', output)
  );
  const server = createServer((req, res) => void handler(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/snapshot`);
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get('set-cookie') ?? '',
      /^invoicing_session=[0-9a-f-]{36}; Path=\/; HttpOnly; SameSite=Lax$/,
    );
    const snapshot = await response.json();
    assert.equal(snapshot.invoices.length, 150);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
