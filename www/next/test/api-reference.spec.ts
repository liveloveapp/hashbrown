import { expect, test } from 'vitest';
import { listSymbols, readSymbol } from '../src/lib/api-reference';

test('lists symbols for every documented package', () => {
  const symbols = listSymbols();

  expect(symbols).toContainEqual({ pkg: 'react', symbol: 'useChat' });
  expect(symbols).toContainEqual({ pkg: 'core', symbol: 's' });
  expect(symbols.length).toBe(189);
});

test('reads a symbol with its summary and signature', () => {
  const symbol = readSymbol('react', 'useChat');

  expect(symbol?.name).toBe('useChat');
  expect(symbol?.kind).toBe('Function');
  expect(symbol?.members[0].docs.summary).toContain(
    'This React hook creates a chat instance',
  );
  expect(symbol?.members[0].formattedContent).toContain(
    'export declare function useChat',
  );
});

test('returns undefined for unknown symbols and path escapes', () => {
  const unknown = readSymbol('react', 'nope');
  // Resolves to the repo's package.json, which exists.
  const escape = readSymbol('../../../../..', 'package');

  expect(unknown).toBeUndefined();
  expect(escape).toBeUndefined();
});
