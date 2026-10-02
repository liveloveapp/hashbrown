import type { ProxyOptions } from 'vite';

/**
 * Dev-server proxy options for the local agent server.
 *
 * Vite's proxy answers an upstream failure with a 502 only while it can
 * still write headers. If the agent server dies after a run's event stream
 * has started, Vite leaves the browser's response open, so the page waits on
 * "Reading your ledger…" forever instead of showing its error. Destroying
 * the browser's response when the upstream one closes unfinished ends the
 * stream with a network error, which Hashbrown reports as a failed run.
 *
 * @param target - The agent server origin, e.g. `http://127.0.0.1:4325`.
 */
export function agentProxy(target: string): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    configure: (proxy) => {
      proxy.on('proxyRes', (upstream, _request, response) => {
        upstream.on('close', () => {
          if (!upstream.complete) response.destroy();
        });
      });
    },
  };
}
