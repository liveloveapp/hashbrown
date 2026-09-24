import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect, ViteDevServer } from 'vite';
import { contentModulesNoCachePlugin } from './content-modules-no-cache-plugin';

function serveThroughPlugin(url: string): Record<string, unknown> {
  const headers: Record<string, unknown> = {};
  const response = {
    setHeader: (name: string, value: unknown) => {
      headers[name] = value;
      return response;
    },
  };
  let middleware: Connect.NextHandleFunction | undefined;
  const server = {
    middlewares: {
      use: (handler: Connect.NextHandleFunction) => {
        middleware = handler;
      },
    },
  };
  const plugin = contentModulesNoCachePlugin();
  (plugin.configureServer as (server: ViteDevServer) => void)(
    server as unknown as ViteDevServer,
  );

  middleware?.(
    { url } as IncomingMessage,
    response as unknown as ServerResponse,
    () => {
      response.setHeader('Cache-Control', 'max-age=31536000,immutable');
    },
  );

  return headers;
}

test('serves Analog content modules with no-cache instead of immutable', () => {
  const url =
    '/@fs/repo/node_modules/@analogjs/content/fesm2022/content-list-loader.mjs?v=3c7c20a8';

  const headers = serveThroughPlugin(url);

  expect(headers).toEqual({ 'Cache-Control': 'no-cache' });
});

test('serves Analog router content modules with no-cache instead of immutable', () => {
  const url =
    '/@fs/repo/node_modules/@analogjs/router/fesm2022/route-files.mjs?v=3c7c20a8';

  const headers = serveThroughPlugin(url);

  expect(headers).toEqual({ 'Cache-Control': 'no-cache' });
});

test('keeps immutable caching for other versioned dependencies', () => {
  const url = '/node_modules/.vite/deps/@angular_core.js?v=3c7c20a8';

  const headers = serveThroughPlugin(url);

  expect(headers).toEqual({ 'Cache-Control': 'max-age=31536000,immutable' });
});
