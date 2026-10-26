import type { Message } from '@ag-ui/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import { prepareChromePromptMedia } from './chrome-prompt-media';

const image = {
  type: 'image' as const,
  source: { type: 'data' as const, value: 'AA==', mimeType: 'image/png' },
};

/** Installs an isolated native decoder and restores it even after a failed test. */
async function withDecoder(
  run: (bitmap: {
    width: number;
    height: number;
    close: jest.Mock;
  }) => Promise<void>,
) {
  const global = globalThis as unknown as { createImageBitmap?: unknown };
  const previous = global.createImageBitmap;
  const bitmap = { width: 64, height: 64, close: jest.fn() };
  global.createImageBitmap = jest.fn(async () => bitmap);
  try {
    await run(bitmap);
  } finally {
    if (previous === undefined) delete global.createImageBitmap;
    else global.createImageBitmap = previous;
  }
}

test('resolves ordered user parts without fetching sources and releases owned images once', async () => {
  await withDecoder(async (bitmap) => {
    const dispose = jest.fn();
    const resolve = jest.fn(async () => ({
      blob: new Blob(['encoded image'], { type: 'image/png' }),
      dispose,
    }));
    const message: Message = {
      id: 'user',
      role: 'user',
      content: [
        { type: 'text', text: 'Before' },
        image,
        { type: 'text', text: 'After' },
      ],
    };
    const controller = new AbortController();

    const prepared = await prepareChromePromptMedia(
      [message],
      { images: {}, resolve },
      controller.signal,
    );

    expect(prepared.contents.get(message)).toEqual([
      { type: 'text', value: 'Before' },
      { type: 'image', value: bitmap },
      { type: 'text', value: 'After' },
    ]);
    expect(prepared.inputTypes).toEqual(['text', 'image']);
    expect(resolve).toHaveBeenCalledWith(image, { signal: controller.signal });
    expect(bitmap.close).not.toHaveBeenCalled();
    await prepared.dispose();
    await prepared.dispose();
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

test.each([
  ['image opt-in', { ...image }, {}],
  [
    'invalid base64',
    { ...image, source: { ...image.source, value: 'invalid!' } },
    { images: {} },
  ],
  [
    'opaque audio without opt-in',
    { type: 'audio', source: { type: 'file', value: 'opaque' } },
    { images: {} },
  ],
  [
    'unsupported document',
    { type: 'document', source: { type: 'file', value: 'opaque' } },
    { images: {} },
  ],
])('rejects %s before invoking a resolver', async (_label, part, policy) => {
  const resolve = jest.fn();
  const message = { id: 'user', role: 'user', content: [part] } as Message;

  const result = prepareChromePromptMedia(
    [message],
    { ...policy, resolve },
    new AbortController().signal,
  );

  await expect(result).rejects.toMatchObject({ retryable: false });
  expect(resolve).not.toHaveBeenCalled();
});

test('does not resolve assistant media', async () => {
  const resolve = jest.fn();
  const message = {
    id: 'assistant',
    role: 'assistant',
    content: [image],
  } as unknown as Message;

  const result = prepareChromePromptMedia(
    [message],
    { images: {}, resolve },
    new AbortController().signal,
  );

  await expect(result).rejects.toMatchObject({ code: 'FEATURE_UNSUPPORTED' });
  expect(resolve).not.toHaveBeenCalled();
});

test.each([
  ['bytes', { images: { maxBytes: 1 } }, 'image/png'],
  ['pixels', { images: { maxPixels: 1 } }, 'image/png'],
  ['total bytes', { images: {}, maxTotalBytes: 1 }, 'image/png'],
  ['MIME', { images: {} }, 'image/svg+xml'],
])(
  'releases resources after rejecting %s',
  async (_label, policy, mimeType) => {
    await withDecoder(async (bitmap) => {
      const dispose = jest.fn();
      const resolve = async () => ({
        blob: new Blob(['encoded image'], { type: mimeType }),
        dispose,
      });
      const message: Message = { id: 'user', role: 'user', content: [image] };

      const result = prepareChromePromptMedia(
        [message],
        { ...policy, resolve },
        new AbortController().signal,
      );

      await expect(result).rejects.toMatchObject({ retryable: false });
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(bitmap.close.mock.calls.length).toBeLessThanOrEqual(1);
    });
  },
);

test('releases prior images when a later resolution fails', async () => {
  await withDecoder(async (bitmap) => {
    const dispose = jest.fn();
    const resolve = jest
      .fn()
      .mockResolvedValueOnce({
        blob: new Blob(['image'], { type: 'image/png' }),
        dispose,
      })
      .mockRejectedValueOnce(new Error('Second image failed'));
    const message: Message = {
      id: 'user',
      role: 'user',
      content: [image, image],
    };

    const result = prepareChromePromptMedia(
      [message],
      { images: {}, resolve },
      new AbortController().signal,
    );

    await expect(result).rejects.toThrow('Second image failed');
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

test('settles an aborted resolver promptly and disposes its late resource without decoding', async () => {
  await withDecoder(async (bitmap) => {
    const controller = new AbortController();
    const dispose = jest.fn();
    let finish!: (value: { blob: Blob; dispose: jest.Mock }) => void;
    const resolve = () =>
      new Promise<{ blob: Blob; dispose: jest.Mock }>((complete) => {
        finish = complete;
      });
    const message: Message = { id: 'user', role: 'user', content: [image] };
    const pending = prepareChromePromptMedia(
      [message],
      { images: {}, resolve },
      controller.signal,
    );

    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: 'PROMPT_API_ABORTED' });
    finish({ blob: new Blob(['image'], { type: 'image/png' }), dispose });
    for (let index = 0; index < 10; index++) await Promise.resolve();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(bitmap.close).not.toHaveBeenCalled();
  });
});

test('does not interpret file handles or URLs and passes them unchanged to application policy', async () => {
  await withDecoder(async () => {
    const part = {
      type: 'image' as const,
      source: {
        type: 'file' as const,
        value: 'https://not-a-network-request.invalid/file',
        provider: 'application',
      },
    };
    const resolve = jest.fn(async () => ({
      blob: new Blob(['image'], { type: 'image/png' }),
    }));
    const message: Message = { id: 'user', role: 'user', content: [part] };

    const prepared = await prepareChromePromptMedia(
      [message],
      { images: {}, resolve },
      new AbortController().signal,
    );

    expect(resolve).toHaveBeenCalledWith(part, expect.any(Object));
    await prepared.dispose();
  });
});

test('closes a decoded image that settles after cancellation without leaking its resolver resource', async () => {
  await withDecoder(async (bitmap) => {
    const controller = new AbortController();
    const dispose = jest.fn();
    let finish!: (bitmap: unknown) => void;
    (
      globalThis as unknown as { createImageBitmap: unknown }
    ).createImageBitmap = jest.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const resolve = async () => ({
      blob: new Blob(['image'], { type: 'image/png' }),
      dispose,
    });
    const message: Message = { id: 'user', role: 'user', content: [image] };
    const pending = prepareChromePromptMedia(
      [message],
      { images: {}, resolve },
      controller.signal,
    );
    while (!finish) await Promise.resolve();

    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: 'PROMPT_API_ABORTED' });
    expect(dispose).toHaveBeenCalledTimes(1);
    finish(bitmap);
    for (let index = 0; index < 10; index++) await Promise.resolve();
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

test('releases an encoded resource when actual image decoding fails', async () => {
  await withDecoder(async () => {
    (
      globalThis as unknown as { createImageBitmap: unknown }
    ).createImageBitmap = jest.fn(async () => {
      throw new Error('Invalid image bytes');
    });
    const dispose = jest.fn();
    const resolve = async () => ({
      blob: new Blob(['invalid image'], { type: 'image/png' }),
      dispose,
    });
    const message: Message = { id: 'user', role: 'user', content: [image] };

    const pending = prepareChromePromptMedia(
      [message],
      { images: {}, resolve },
      new AbortController().signal,
    );

    await expect(pending).rejects.toMatchObject({
      code: 'INVALID_MEDIA',
      retryable: false,
    });
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

test('attempts every cleanup even when an application disposer rejects', async () => {
  await withDecoder(async (bitmap) => {
    const dispose = jest.fn(async () => {
      throw new Error('Application cleanup failed');
    });
    const resolve = async () => ({
      blob: new Blob(['image'], { type: 'image/png' }),
      dispose,
    });
    const message: Message = { id: 'user', role: 'user', content: [image] };
    const prepared = await prepareChromePromptMedia(
      [message],
      { images: {}, resolve },
      new AbortController().signal,
    );

    await expect(prepared.dispose()).rejects.toThrow(
      'Application cleanup failed',
    );

    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

test('supports public media declarations in a Node-only consumer without DOM libraries', () => {
  const virtualDirectory = join(__dirname, '__node_declaration_consumer__');
  const declarationPath = join(virtualDirectory, 'chrome-prompt-media.d.ts');
  const consumerPath = join(virtualDirectory, 'consumer.ts');
  const declaration = ts.transpileDeclaration(
    readFileSync(join(__dirname, 'chrome-prompt-media.ts'), 'utf8'),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        declaration: true,
        emitDeclarationOnly: true,
      },
    },
  ).outputText;
  const consumer = `import type { ChromePromptContent } from './chrome-prompt-media';
    const image: Extract<ChromePromptContent, { type: 'image' }> = {
      type: 'image', value: { width: 1, height: 1, close() {} },
    };
    void image;`;
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.Node16,
    moduleResolution: ts.ModuleResolutionKind.Node16,
    lib: ['lib.es2022.d.ts'],
    types: ['node'],
    skipLibCheck: false,
    strict: true,
    noEmit: true,
  };
  const host = ts.createCompilerHost(options);
  const files = new Map([
    [declarationPath, declaration],
    [consumerPath, consumer],
  ]);
  for (const name of [
    'experimental-chrome-local-transport',
    'transport',
    'transport-error',
  ]) {
    const output = ts.transpileDeclaration(
      readFileSync(join(__dirname, `${name}.ts`), 'utf8'),
      {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          declaration: true,
          emitDeclarationOnly: true,
        },
      },
    ).outputText;
    files.set(join(virtualDirectory, `${name}.d.ts`), output);
  }
  const originalDirectoryExists = host.directoryExists?.bind(host);
  host.directoryExists = (directory) =>
    directory === virtualDirectory ||
    originalDirectoryExists?.(directory) === true;
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);
  host.fileExists = (file) => files.has(file) || originalFileExists(file);
  host.getSourceFile = (
    file,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) => {
    const source = files.get(file);
    return source === undefined
      ? originalGetSourceFile(
          file,
          languageVersion,
          onError,
          shouldCreateNewSourceFile,
        )
      : ts.createSourceFile(file, source, languageVersion);
  };

  const program = ts.createProgram([consumerPath], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);

  expect(
    diagnostics.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    ),
  ).toEqual([]);
});

test('preserves cancellation when native image decoding rejects after abort', async () => {
  await withDecoder(async () => {
    const controller = new AbortController();
    (
      globalThis as unknown as { createImageBitmap: unknown }
    ).createImageBitmap = jest.fn(async () => {
      controller.abort();
      throw new Error('Native decode cancelled');
    });
    const dispose = jest.fn();
    const resolve = async () => ({
      blob: new Blob(['image'], { type: 'image/png' }),
      dispose,
    });
    const message: Message = { id: 'user', role: 'user', content: [image] };

    const pending = prepareChromePromptMedia(
      [message],
      { images: {}, resolve },
      controller.signal,
    );

    await expect(pending).rejects.toMatchObject({
      code: 'PROMPT_API_ABORTED',
      retryable: false,
    });
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
