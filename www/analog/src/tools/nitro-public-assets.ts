import { isAbsolute, resolve } from 'node:path';

interface NitroPublicAsset {
  dir: string;
}

interface NitroBuildInstance {
  options: {
    publicAssets: NitroPublicAsset[];
  };
  hooks: {
    hook(name: string, handler: () => void): void;
  };
}

/**
 * Creates a Nitro build plugin that resolves public asset directories from the
 * Vite project root instead of the process working directory.
 */
export function normalizeNitroPublicAssetPaths(projectRoot: string) {
  return {
    name: 'normalize-nitro-public-asset-paths',
    nitro: {
      setup(nitroInstance: NitroBuildInstance) {
        nitroInstance.hooks.hook('build:before', () => {
          nitroInstance.options.publicAssets =
            nitroInstance.options.publicAssets.map((asset) => ({
              ...asset,
              dir: isAbsolute(asset.dir)
                ? asset.dir
                : resolve(projectRoot, asset.dir),
            }));
        });
      },
    },
  };
}
