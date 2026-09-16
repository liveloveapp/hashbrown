import { createRuntimeRequestListener } from '@b4run/cli/runtime';
import { invoicingUiResponseSchema } from '@invoicing/contracts';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInvoicingListener } from './http';
import { createReviewCoordinator } from './review-coordinator';
import { createReviewMiddleware } from './review-middleware';
import { createSessionStore } from './session-store';
import { createSampleLedger } from './sample-ledger';
import { createAssistantMiddleware } from './assistant-middleware';
import { createThreadOwnershipGuard } from './thread-ownership';
import { createMemoryRepositories } from './persistence/memory';

const requireFromServer = createRequire(import.meta.url);

async function packageDirectory(name: string): Promise<string> {
  let directory = dirname(requireFromServer.resolve(name));
  while (dirname(directory) !== directory) {
    try {
      const manifest = JSON.parse(
        await readFile(join(directory, 'package.json'), 'utf8'),
      );
      if (manifest.name === name) return directory;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    directory = dirname(directory);
  }
  throw new Error(`Package directory not found: ${name}`);
}

/** Create a fresh ledger and B4 workspace with the same process lifetime. */
export async function createInvoicingRuntime() {
  const appRoot = await mkdtemp(join(tmpdir(), 'hashbrown-invoicing-'));
  try {
    await cp(import.meta.dirname, join(appRoot, 'src'), {
      recursive: true,
      filter: (source) => !source.endsWith('.spec.ts'),
    });
    await writeFile(
      join(appRoot, 'package.json'),
      JSON.stringify({ name: 'invoicing-agent', type: 'module' }),
    );
    await writeFile(join(appRoot, 'b4.config.ts'), 'export default {};\n');
    await mkdir(join(appRoot, 'node_modules', '@b4run'), { recursive: true });
    for (const name of ['sdk', 'langchain', 'cli']) {
      await symlink(
        await packageDirectory(`@b4run/${name}`),
        join(appRoot, 'node_modules', '@b4run', name),
        'dir',
      );
    }
    const repositories = createMemoryRepositories();
    const store = createSessionStore(repositories.sessions, createSampleLedger);
    const reviews = createReviewCoordinator(
      store,
      repositories.threads,
      invoicingUiResponseSchema,
    );
    const review = createReviewMiddleware(store, reviews);
    const assistant = createAssistantMiddleware(store, repositories.threads);
    const claimThread = createThreadOwnershipGuard(store, repositories.threads);
    const runtime = await createRuntimeRequestListener({
      appRoot,
      middleware: async (request) => {
        const result =
          request.routeId === '/assistant'
            ? await assistant(request)
            : await review(request);
        if (result.action === 'continue') {
          try {
            await claimThread(request.headers, request.routeId, request.body);
          } catch {
            return {
              action: 'reject',
              status: 422,
              body: { error: 'invalid_thread' },
            };
          }
        }
        return result;
      },
    });
    return {
      listener: createInvoicingListener(store, reviews, runtime.listener),
      close: async () => {
        try {
          await runtime.close();
        } finally {
          await rm(appRoot, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    await rm(appRoot, { recursive: true, force: true });
    throw error;
  }
}
