import { Plugin } from 'vite';
import { parse as parseYaml } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';

export interface StackblitzConfig {
  name: string;
  description: string;
  open: string;
  extends?: string;
  files: Record<string, string>;
}

const EMPTY_CONFIG: StackblitzConfig = {
  name: '',
  description: '',
  open: 'app/main.ts',
  files: {},
};

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8'),
);

const ANGULAR_VERSION = packageJson.dependencies['@angular/core'];
const HASHBROWN_VERSION = packageJson.version;
const NGRX_VERSION = packageJson.dependencies['@ngrx/signals'];
const NGX_MARKDOWN_VERSION = packageJson.dependencies['ngx-markdown'];
const NODE_VERSION = packageJson.devDependencies['@types/node'];
const REACT_VERSION = packageJson.dependencies['react'];
const TYPESCRIPT_VERSION = packageJson.devDependencies['typescript'];
const VITE_PLUGIN_REACT_VERSION =
  packageJson.devDependencies['@vitejs/plugin-react'];
const VITE_VERSION = packageJson.devDependencies['vite'];
const ZUSTAND_VERSION = packageJson.devDependencies['zustand'];

export default function hashbrownStackblitzPlugin(): Plugin {
  function resolveFiles(
    id: string,
    files: Record<string, string>,
  ): Record<string, string> {
    return Object.keys(files).reduce(
      (acc, file) => {
        const filePath = path.resolve(path.dirname(id), files[file]);
        const content = fs.readFileSync(filePath, 'utf-8');

        if (file === 'package.json') {
          acc[file] = content
            .replace(/<angular-version>/g, ANGULAR_VERSION)
            .replace(/<hashbrown-version>/g, HASHBROWN_VERSION)
            .replace(/<ngrx-version>/g, NGRX_VERSION)
            .replace(/<ngx-markdown-version>/g, NGX_MARKDOWN_VERSION)
            .replace(/<node-version>/g, NODE_VERSION)
            .replace(/<react-version>/g, REACT_VERSION)
            .replace(/<typescript-version>/g, TYPESCRIPT_VERSION)
            .replace(/<vite-plugin-react-version>/g, VITE_PLUGIN_REACT_VERSION)
            .replace(/<vite-version>/g, VITE_VERSION)
            .replace(/<zustand-version>/g, ZUSTAND_VERSION);

          return acc;
        }

        acc[file] = content;
        return acc;
      },
      {} as Record<string, string>,
    );
  }

  function loadConfigRecursively(
    id: string,
    visited = new Set<string>(),
  ): StackblitzConfig {
    if (visited.has(id)) {
      throw new Error(`Circular extends detected: ${id}`);
    }
    visited.add(id);

    const contents = fs.readFileSync(id, 'utf-8');
    const config = parseYaml(contents) as StackblitzConfig;

    // Start from an empty base
    let baseConfig: StackblitzConfig = { ...EMPTY_CONFIG, files: {} };

    // If there's an extends, load and merge recursively
    if (config.extends) {
      const basePath = path.resolve(path.dirname(id), config.extends);
      baseConfig = loadConfigRecursively(basePath, visited);
    }

    // Resolve this config's own files
    const ownFiles = resolveFiles(id, config.files);

    // Merge base and own config
    return {
      ...baseConfig,
      ...config,
      files: {
        ...baseConfig.files,
        ...ownFiles,
      },
    };
  }

  return {
    name: 'hashbrown-stackblitz-plugin',

    transform(src, id) {
      if (!id.includes('stackblitz.yml')) {
        return;
      }

      if (src.startsWith('export default')) {
        return src;
      }

      const config = loadConfigRecursively(id);
      return `export default ${JSON.stringify(config)};`;
    },
  };
}
