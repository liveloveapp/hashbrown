import { resolve } from 'node:path';
import { normalizeNitroPublicAssetPaths } from './nitro-public-assets';

test('normalizes relative Nitro public asset directories against the project root', () => {
  const projectRoot = '/workspace/www/analog';
  const absoluteDirectory = '/workspace/www/analog/public';
  const publicAssets = [
    { dir: absoluteDirectory },
    { dir: '../../dist/www/analog/client' },
  ];
  let buildBefore: (() => void) | undefined;
  const nitroInstance = {
    options: { publicAssets },
    hooks: {
      hook: (_name: string, handler: () => void) => {
        buildBefore = handler;
      },
    },
  };

  normalizeNitroPublicAssetPaths(projectRoot).nitro.setup(nitroInstance);
  buildBefore?.();

  expect(nitroInstance.options.publicAssets).toEqual([
    { dir: absoluteDirectory },
    { dir: resolve(projectRoot, '../../dist/www/analog/client') },
  ]);
});
