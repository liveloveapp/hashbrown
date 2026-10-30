// The origins module has no imports and only erasable types, so Node (type
// stripping) and tsx both load it directly.
import { WORKBENCH_DOCS_ORIGINS } from '../../www/examples/quickstart/runtime/workbench-origins.ts';

/**
 * The Build Output API `config.json` for the hosted workbench: every response
 * may be framed only by the docs origins, `/` redirects to the React page, and
 * `/api/workbench/*` goes to the streaming function.
 *
 * @returns The `config.json` object.
 */
export function workbenchVercelConfig() {
  return {
    version: 3,
    routes: [
      {
        src: '^/(.*)$',
        headers: {
          'Content-Security-Policy': `frame-ancestors ${WORKBENCH_DOCS_ORIGINS.join(' ')}`,
        },
        continue: true,
      },
      { src: '^/$', status: 307, headers: { Location: '/react.html' } },
      { src: '^/api/workbench(?:/.*)?$', dest: '/api/workbench' },
    ],
  };
}
