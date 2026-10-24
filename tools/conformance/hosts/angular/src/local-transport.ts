import {
  experimental_chrome,
  experimental_webllm,
  type TransportFactory,
  type WebLlmEngine,
} from '@hashbrownai/core';

/** Selects an explicitly requested local transport for the fixture hosts. */
export function readLocalTransport(): TransportFactory | undefined {
  const name = new URL(globalThis.location.href).searchParams.get('localModel');
  if (name === 'chrome') return experimental_chrome();
  if (name === 'webllm') {
    const engine = (
      globalThis as unknown as { __hashbrownWebLlm?: WebLlmEngine }
    ).__hashbrownWebLlm;
    if (!engine)
      throw new Error('The application must prepare a WebLLM engine first.');
    return experimental_webllm({ engine });
  }
  return undefined;
}
