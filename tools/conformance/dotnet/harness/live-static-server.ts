import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type { AddressInfo } from 'node:net';

/** Owned loopback origin serving only an already verified published consumer artifact. */
export interface LiveStaticServer {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

/** Serves ordinary files beneath one canonical artifact directory, rejecting traversal and symlinks. */
export async function startLiveStaticServer(
  directory: string,
): Promise<LiveStaticServer> {
  const root = await realpath(directory);
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD')
        throw new Error();
      const path = decodeURIComponent(
        new URL(request.url ?? '/', 'http://localhost').pathname,
      );
      const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
      if (
        !file.startsWith(root + sep) ||
        (await realpath(file)) !== file ||
        !(await stat(file)).isFile()
      )
        throw new Error();
      const contentTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
      };
      response.writeHead(200, {
        'Content-Type':
          contentTypes[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(
        request.method === 'HEAD' ? undefined : await readFile(file),
      );
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  return Object.freeze({
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    stop: async () => {
      server.closeAllConnections();
      await new Promise<void>((accept) => server.close(() => accept()));
    },
  });
}
