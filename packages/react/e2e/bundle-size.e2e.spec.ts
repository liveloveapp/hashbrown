import { build, type Metafile } from 'esbuild';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const workspaceRoot = resolve(__dirname, '../../..');
const coreDistPath = join(workspaceRoot, 'dist/packages/core');
const reactDistPath = join(workspaceRoot, 'dist/packages/react');

/**
 * Size budgets, in bytes, for an app that only renders generative UI from a
 * streamed message. They sit a few KB above the measured sizes (104 KB / 31 KB
 * gzip with markdown, 57 KB / 16 KB gzip without) so that an accidental return
 * of the chat runtime, AG-UI or zod fails loudly.
 */
const withMarkdownBudget = { minified: 110 * 1024, gzip: 33 * 1024 };
const withoutMarkdownBudget = { minified: 62 * 1024, gzip: 18 * 1024 };

const metricComponent = `
  function Metric({ label, value }: { label: string; value: string }) {
    return <div>{label}{value}</div>;
  }
`;

const rendererWithMarkdown = `
  import { s, prompt } from '@hashbrownai/core';
  import { exposeComponent, exposeMarkdown, useUiKit, useJsonParser } from '@hashbrownai/react';
  ${metricComponent}
  export function Msg({ content }: { content: string }) {
    const kit = useUiKit({
      examples: prompt\`<ui><metric label="Revenue" value="$1M" /></ui>\`,
      components: [
        exposeMarkdown(),
        exposeComponent(Metric, { name: 'metric', description: 'KPI', props: { label: s.string('l'), value: s.string('v') } }),
      ],
    });
    const { value } = useJsonParser(content, kit.schema);
    return value ? <>{kit.render(value)}</> : null;
  }
`;

const rendererWithoutMarkdown = `
  import { s, prompt } from '@hashbrownai/core';
  import { exposeComponent, useUiKit, useJsonParser } from '@hashbrownai/react';
  ${metricComponent}
  export function Msg({ content }: { content: string }) {
    const kit = useUiKit({
      examples: prompt\`<ui><metric label="Revenue" value="$1M" /></ui>\`,
      components: [
        exposeComponent(Metric, { name: 'metric', description: 'KPI', props: { label: s.string('l'), value: s.string('v') } }),
      ],
    });
    const { value } = useJsonParser(content, kit.schema);
    return value ? <>{kit.render(value)}</> : null;
  }
`;

type BundleReport = {
  readonly minifiedBytes: number;
  readonly gzipBytes: number;
  readonly inputs: readonly string[];
};

async function bundleBrowserApp(contents: string): Promise<BundleReport> {
  const result = await build({
    stdin: { contents, loader: 'tsx', resolveDir: workspaceRoot },
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: {
      '@hashbrownai/core': coreDistPath,
      '@hashbrownai/react': reactDistPath,
    },
    write: false,
    metafile: true,
    logLevel: 'silent',
  });
  const [output] = result.outputFiles;
  const [outputMeta] = Object.values((result.metafile as Metafile).outputs);

  return {
    minifiedBytes: output.contents.length,
    gzipBytes: gzipSync(output.contents).length,
    inputs: Object.entries(outputMeta.inputs)
      .filter(([, input]) => input.bytesInOutput > 0)
      .map(([path]) => path),
  };
}

function findChatRuntimeInputs(inputs: readonly string[]): string[] {
  return inputs.filter((path) =>
    /node_modules\/(@ag-ui|zod)\/|dist\/packages\/core\/(reducers|effects|transport|chat-runtime|runtime)\b/.test(
      path,
    ),
  );
}

test('a generative UI renderer with markdown stays within its bundle budget', async () => {
  const source = rendererWithMarkdown;

  const report = await bundleBrowserApp(source);

  expect(findChatRuntimeInputs(report.inputs)).toEqual([]);
  expect(report.minifiedBytes).toBeLessThanOrEqual(withMarkdownBudget.minified);
  expect(report.gzipBytes).toBeLessThanOrEqual(withMarkdownBudget.gzip);
});

test('a generative UI renderer without markdown stays within its bundle budget', async () => {
  const source = rendererWithoutMarkdown;

  const report = await bundleBrowserApp(source);

  expect(findChatRuntimeInputs(report.inputs)).toEqual([]);
  expect(
    report.inputs.filter((path) =>
      path.includes('@cacheplane/partial-markdown'),
    ),
  ).toEqual([]);
  expect(report.minifiedBytes).toBeLessThanOrEqual(
    withoutMarkdownBudget.minified,
  );
  expect(report.gzipBytes).toBeLessThanOrEqual(withoutMarkdownBudget.gzip);
});
