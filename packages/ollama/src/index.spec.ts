import type { AGUIEvent } from '@ag-ui/core';
import { HashbrownOllama, type OllamaTextStreamOptions } from './index';

test('exports the Ollama AG-UI stream contract', () => {
  const text: (options: OllamaTextStreamOptions) => AsyncIterable<AGUIEvent> =
    HashbrownOllama.stream.text;

  expect(text).toBe(HashbrownOllama.stream.text);
});
