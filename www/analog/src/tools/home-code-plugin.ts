import { resolve } from 'node:path';
import { type Plugin, runnerImport } from 'vite';
import { getSiteHighlighter, renderHomeCodeModule } from './highlight-code';

const ID = 'virtual:home-code-html';
const RESOLVED = `\0${ID}`;

/**
 * Serve the homepage code samples as HTML highlighted at build time.
 *
 * @param root - The `www/analog` directory.
 */
export default function homeCodePlugin(root: string): Plugin {
  const content = resolve(root, 'src/app/components/home/home.content.ts');
  return {
    name: 'hashbrown-home-code-html',
    resolveId: (id) => (id === ID ? RESOLVED : undefined),
    async load(id) {
      if (id !== RESOLVED) return;
      this.addWatchFile(content);
      const { module } =
        await runnerImport<
          typeof import('../app/components/home/home.content')
        >(content);
      return renderHomeCodeModule(await getSiteHighlighter(), module);
    },
  };
}
