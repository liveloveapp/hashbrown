import type { Plugin } from 'vite';

const ANALOG_CONTENT_MODULE_URL =
  /\/node_modules\/@analogjs\/(?:content|router)\//;

/**
 * Creates a dev-only Vite plugin that stops the browser from caching Analog's
 * content modules forever.
 *
 * Analog's content and router plugins write the list of Markdown files into
 * modules inside `node_modules/@analogjs/{content,router}`. Vite serves those
 * files with its `?v=<browserHash>` query and
 * `Cache-Control: max-age=31536000,immutable`, but the hash only tracks
 * dependencies, not content files. After a post is added, the browser keeps
 * loading its cached list, so client-side navigation shows "No Content Found"
 * while server rendering works. Serving these modules with `no-cache` makes
 * the browser revalidate them by ETag on every load.
 */
export function contentModulesNoCachePlugin(): Plugin {
  return {
    name: 'hashbrown-content-modules-no-cache',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && ANALOG_CONTENT_MODULE_URL.test(req.url)) {
          const setHeader = res.setHeader.bind(res);
          res.setHeader = (name, value) =>
            setHeader(
              name,
              name.toLowerCase() === 'cache-control' ? 'no-cache' : value,
            );
        }
        next();
      });
    },
  };
}
