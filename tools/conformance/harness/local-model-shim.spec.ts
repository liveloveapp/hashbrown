import type { WebLlmChunk, WebLlmEngine } from '@hashbrownai/core';
import type { Page } from '@playwright/test';
import { runInNewContext } from 'node:vm';
import { installLocalModelShim } from '../local-models/shim';

/** Captures and evaluates the actual browser initializer in isolation without network access. */
async function initializeShim(observeWebLlm: boolean) {
  const scripts: { source: string; argument: unknown }[] = [];
  const page = {
    addInitScript: async (script: unknown, argument: unknown) => {
      scripts.push({ source: String(script), argument });
    },
  } as unknown as Page;
  await installLocalModelShim(page, 'http://aimock.test', { observeWebLlm });
  const context = { AbortController, argument: scripts[0].argument };
  runInNewContext(`(${scripts[0].source})(argument)`, context);
  return {
    scripts,
    runtime: context as unknown as {
      __hashbrownWebLlm: WebLlmEngine;
      __webLlmRawChunks?: WebLlmChunk[];
      __webLlmActive?: number;
    },
  };
}

test('installs the aimock engine and requested observation atomically in one initializer', async () => {
  const { scripts, runtime } = await initializeShim(true);

  expect(scripts).toHaveLength(1);
  expect(runtime.__hashbrownWebLlm).toBeDefined();
  expect(runtime.__webLlmRawChunks).toEqual([]);
  expect(runtime.__webLlmActive).toBe(0);
});

test('keeps observation disabled for the existing ordinary model fixtures', async () => {
  const { scripts, runtime } = await initializeShim(false);

  expect(scripts).toHaveLength(1);
  expect(runtime.__hashbrownWebLlm).toBeDefined();
  expect(runtime.__webLlmRawChunks).toBeUndefined();
  expect(runtime.__webLlmActive).toBeUndefined();
});
