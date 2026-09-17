#!/usr/bin/env node
/**
 * Assemble a Vercel Build Output API (v3) tree from a manifest:
 *
 *   node tools/vercel/assemble.mjs <path/to/vercel.assembly.json>
 *
 * {
 *   "output": ".vercel/output",
 *   "static": { "dir": "../../dist/app", "spaFallback": "index.html" },
 *   "functions": {
 *     "index": { "from": "server/.vercel/output/functions/index.func",
 *                "config": { "maxDuration": 300, "supportsResponseStreaming": true } },
 *     "api":   { "entry": "server/src/api.ts", "runtime": "nodejs24.x", "maxDuration": 30 }
 *   },
 *   "routes": [ { "src": "/api/(.*)", "dest": "/api" } ],
 *   "tsconfig": "../../tsconfig.base.json"
 * }
 *
 * Paths resolve relative to the manifest. `from` copies a prebuilt function
 * directory verbatim and merges `config` into its .vc-config.json; `entry`
 * bundles a Node handler with esbuild. When the manifest specifies
 * `tsconfig`, it's passed to esbuild so TS path aliases (e.g. workspace
 * package mappings from tsconfig.base.json) resolve during bundling. Routes
 * are emitted after `handle: filesystem` and before the SPA fallback.
 */
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

export function buildRoutes({ routes = [], spaFallback }) {
  return [
    { handle: 'filesystem' },
    ...routes,
    ...(spaFallback ? [{ src: '/(.*)', dest: `/${spaFallback}` }] : []),
  ];
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

export async function assemble(manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const base = dirname(resolve(manifestPath));
  const at = (relative) => resolve(base, relative);
  const output = at(manifest.output ?? '.vercel/output');
  const staging = `${output}.staging`;

  await rm(staging, { recursive: true, force: true });
  await mkdir(join(staging, 'functions'), { recursive: true });

  try {
    if (manifest.static?.dir) {
      await cp(at(manifest.static.dir), join(staging, 'static'), {
        recursive: true,
      });
    }

    for (const [name, fn] of Object.entries(manifest.functions ?? {})) {
      const dir = join(staging, 'functions', `${name}.func`);
      if (fn.from) {
        await cp(at(fn.from), dir, { recursive: true, verbatimSymlinks: true });
        if (fn.config) {
          const configPath = join(dir, '.vc-config.json');
          const current = JSON.parse(await readFile(configPath, 'utf8'));
          await writeFile(configPath, json({ ...current, ...fn.config }));
        }
        continue;
      }
      if (!fn.entry) {
        throw new Error(`Function "${name}" needs either "from" or "entry".`);
      }
      await mkdir(dir, { recursive: true });
      await build({
        entryPoints: [at(fn.entry)],
        outfile: join(dir, 'index.mjs'),
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node24',
        sourcemap: false,
        logLevel: 'error',
        ...(manifest.tsconfig ? { tsconfig: at(manifest.tsconfig) } : {}),
        banner: {
          js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
        },
      });
      await writeFile(
        join(dir, '.vc-config.json'),
        json({
          handler: 'index.mjs',
          launcherType: 'Nodejs',
          runtime: fn.runtime ?? 'nodejs24.x',
          ...(fn.maxDuration ? { maxDuration: fn.maxDuration } : {}),
          supportsResponseStreaming: true,
        }),
      );
    }

    await writeFile(
      join(staging, 'config.json'),
      json({
        version: 3,
        routes: buildRoutes({
          routes: manifest.routes,
          spaFallback: manifest.static?.spaFallback,
        }),
      }),
    );
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }

  await rm(output, { recursive: true, force: true });
  await rename(staging, output);
  return output;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error(
      'usage: node tools/vercel/assemble.mjs <vercel.assembly.json>',
    );
    process.exitCode = 1;
  } else {
    assemble(manifestPath).then(
      (output) => console.log(`assembled ${output}`),
      (error) => {
        console.error(error.message);
        process.exitCode = 1;
      },
    );
  }
}
