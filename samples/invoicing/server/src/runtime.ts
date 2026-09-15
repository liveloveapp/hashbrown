import { createRuntimeRequestListener } from '@b4run/cli/runtime';
import { invoicingUiResponseSchema } from '@invoicing/contracts';
import { cp, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInvoicingListener } from './http';
import { createReviewCoordinator } from './review-coordinator';
import { createReviewMiddleware } from './review-middleware';
import { createSessionStore } from './session-store';

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
    await symlink(
      resolve(import.meta.dirname, '../../../../node_modules'),
      join(appRoot, 'node_modules'),
      'dir',
    );
    const store = createSessionStore();
    const reviews = createReviewCoordinator(store, invoicingUiResponseSchema);
    const runtime = await createRuntimeRequestListener({
      appRoot,
      middleware: createReviewMiddleware(store, reviews),
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
