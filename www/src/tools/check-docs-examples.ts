import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type Framework = 'angular' | 'react';
type CodeFence = { language: 'ts' | 'tsx'; source: string; index: number };
/** A compiler module extracted from the actual application code in a guide. */
export type ExampleModule = { name: string; source: string; origins: string[] };
const boundary = '\n## Explore it in the workbench\n';

/** Read actual application examples; captured workbench excerpts are a separate contract. */
export function applicationFences(document: string): CodeFence[] {
  const sections = document.split(boundary);
  if (sections.length > 2)
    throw new Error('Expected at most one workbench boundary');
  return [...sections[0].matchAll(/^```(ts|tsx)\n([\s\S]*?)\n```/gm)].map(
    (match, index) => ({
      language: match[1] as CodeFence['language'],
      source: match[2],
      index,
    }),
  );
}

/** Fixed helper filenames preserve the relative imports taught by a recipe. */
export function recipeModules(
  document: string,
  framework: Framework,
  recipe: string,
  names: readonly string[],
): ExampleModule[] {
  if (!document.includes(boundary))
    throw new Error(`${recipe}: missing workbench boundary`);
  const snippets = applicationFences(document);
  if (snippets.length !== names.length) {
    throw new Error(
      `${recipe}: expected ${names.length} application snippets, found ${snippets.length}; update the manifest for intentional changes`,
    );
  }
  return snippets.map(({ language, source }, index) => ({
    name: `${framework}/${recipe}/${names[index]}.${language}`,
    source,
    origins: [`www/content/docs/${framework}/recipes/${recipe}.md`],
  }));
}

/** Concept examples with imports are independent modules; instruction constants are shared. */
export function conceptModules(
  document: string,
  framework: Framework,
  family: string,
  slug: string,
): ExampleModule[] {
  return applicationFences(document).flatMap(({ language, source, index }) => {
    const name = source.startsWith('export const supportInstructions')
      ? 'support-instructions.ts'
      : source.startsWith('import ')
        ? `${framework}-${family}-${slug}-${index}.${language}`
        : null;
    return name
      ? [
          {
            name,
            source,
            origins: [`www/content/docs/${framework}/${family}/${slug}.md`],
          },
        ]
      : [];
  });
}

/** A shared file must contain the same source in every guide that teaches it. */
export function mergeExampleModules(
  modules: readonly ExampleModule[],
): ExampleModule[] {
  const merged = new Map<string, ExampleModule>();
  for (const module of modules) {
    const previous = merged.get(module.name);
    if (previous && previous.source !== module.source) {
      throw new Error(`Divergent shared module: ${module.name}`);
    }
    merged.set(
      module.name,
      previous
        ? { ...previous, origins: [...previous.origins, ...module.origins] }
        : module,
    );
  }
  return [...merged.values()];
}

/** Compile the current introductory application examples against public APIs and strict Angular templates. */
export function checkDocsExamples(workspaceRoot: string): void {
  const manifestPath = join(
    workspaceRoot,
    'www/test/docs/fixtures/recipe-snippets/manifest.json',
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    frameworks: Framework[];
    recipes: Record<string, string[]>;
  };
  const modules: ExampleModule[] = [];
  for (const framework of manifest.frameworks) {
    const docs = join(workspaceRoot, 'www/content/docs', framework);
    for (const [recipe, names] of Object.entries(manifest.recipes)) {
      modules.push(
        ...recipeModules(
          readFileSync(join(docs, 'recipes', `${recipe}.md`), 'utf8'),
          framework,
          recipe,
          names,
        ),
      );
    }
    const concepts = readdirSync(join(docs, 'concept')).filter((name) =>
      name.endsWith('.md'),
    );
    const pages = [
      ...concepts.map((name) => `concept/${name}`),
      'guide/choosing-model.md',
      'guide/prompt-engineering.md',
      'start/how-it-works.md',
    ];
    for (const page of pages) {
      const [family, filename] = page.split('/');
      modules.push(
        ...conceptModules(
          readFileSync(join(docs, page), 'utf8'),
          framework,
          family,
          filename.slice(0, -3),
        ),
      );
    }
  }
  const examples = mergeExampleModules(modules);
  const temporaryRoot = join(workspaceRoot, 'tmp');
  mkdirSync(temporaryRoot, { recursive: true });
  const output = mkdtempSync(join(temporaryRoot, 'docs-application-examples-'));
  try {
    const files = examples.map((example) => {
      const path = join(output, example.name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${example.source}\n`);
      return path;
    });
    const configuration = {
      extends: join(workspaceRoot, 'tsconfig.base.json'),
      compilerOptions: {
        noEmit: true,
        rootDir: workspaceRoot,
        jsx: 'react-jsx',
        target: 'es2023',
        module: 'esnext',
        moduleResolution: 'bundler',
        types: ['node', 'react', 'react-dom'],
        esModuleInterop: true,
        moduleDetection: 'force',
      },
      angularCompilerOptions: { strictTemplates: true },
      files,
      include: [],
      exclude: [],
    };
    const configPath = join(output, 'tsconfig.json');
    writeFileSync(configPath, JSON.stringify(configuration, null, 2));
    // ngc checks every module with TypeScript and additionally checks Angular templates.
    const compiler = realpathSync(join(workspaceRoot, 'node_modules/.bin/ngc'));
    try {
      execFileSync(process.execPath, [compiler, '-p', configPath], {
        cwd: workspaceRoot,
        stdio: 'pipe',
        timeout: 120_000,
      });
    } catch (error) {
      const failure = error as { stdout?: Uint8Array; stderr?: Uint8Array };
      if (failure.stdout) process.stderr.write(failure.stdout);
      if (failure.stderr) process.stderr.write(failure.stderr);
      throw error;
    }
    process.stdout.write(
      `Checked ${examples.length} application modules from ${new Set(examples.flatMap((example) => example.origins)).size} documentation pages with TypeScript and strict Angular templates.\n`,
    );
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  checkDocsExamples(resolve(import.meta.dirname, '../../..'));
}
