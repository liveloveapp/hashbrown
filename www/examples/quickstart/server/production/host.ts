import { once } from 'node:events';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createProductionServer } from './app';

/** Starts the opt-in local reference on one origin with the built Angular/React workbench. */
export async function startProductionHost() {
  const port = Number(process.env['PORT'] ?? 4310);
  const reference = await createProductionServer({
    databaseUrl: process.env['PRODUCTION_DATABASE_URL'] ?? '',
    secret: process.env['PRODUCTION_COOKIE_SECRET'] ?? '',
    origin: process.env['PRODUCTION_ORIGIN'] ?? `http://localhost:${port}`,
    model: process.env['OPENAI_MODEL'],
  });
  const app = express();
  app.disable('x-powered-by');
  app.use(
    '/api/production',
    express.raw({ type: () => true, limit: '128kb' }),
    async (req, res) => {
      const controller = new AbortController();
      res.on('close', () => controller.abort());
      try {
        const request = new Request(
          `${process.env['PRODUCTION_ORIGIN'] ?? `http://localhost:${port}`}${req.originalUrl}`,
          {
            method: req.method,
            headers: req.headers as Record<string, string>,
            signal: controller.signal,
            ...(req.method !== 'GET' && req.method !== 'HEAD'
              ? { body: req.body?.length ? req.body : undefined }
              : {}),
          },
        );
        const response = await reference.fetch(request);
        res.status(response.status);
        response.headers.forEach((value, key) => res.setHeader(key, value));
        if (response.body)
          for await (const chunk of response.body) {
            if (controller.signal.aborted) break;
            if (!res.write(chunk))
              await once(res, 'drain', { signal: controller.signal });
          }
        res.end();
      } catch {
        if (!res.headersSent)
          res.status(500).json({
            error: 'Reference request failed; reread authoritative status',
          });
        else res.end();
      }
    },
  );
  app.use(express.static('dist/docs-workbench/browser'));
  const server = createServer(app);
  await new Promise<void>((resolve) =>
    server.listen(port, '127.0.0.1', resolve),
  );
  console.log(`Production reference listening at http://localhost:${port}`);
  const close = async () => {
    await reference.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  };
  return { close };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startProductionHost()
    .then((host) => {
      process.once('SIGTERM', () => void host.close());
      process.once('SIGINT', () => void host.close());
    })
    .catch(() => {
      console.error(
        'Production reference startup failed. Check server configuration and Postgres availability.',
      );
      process.exitCode = 1;
    });
}
