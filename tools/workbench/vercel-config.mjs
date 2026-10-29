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
          'Content-Security-Policy':
            'frame-ancestors https://hashbrown.dev https://www.hashbrown.dev https://*.vercel.app http://localhost:*',
        },
        continue: true,
      },
      { src: '^/$', status: 307, headers: { Location: '/react.html' } },
      { src: '^/api/workbench(?:/.*)?$', dest: '/api/workbench' },
    ],
  };
}
