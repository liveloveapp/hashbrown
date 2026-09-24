import { expect, test, vi } from 'vitest';
import { copyText } from '../../src/components/home/copy-text';

test('writes the text to the clipboard', async () => {
  const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };

  const result = await copyText('npm i x', clipboard);

  expect(result).toBe(true);
  expect(clipboard.writeText).toHaveBeenCalledWith('npm i x');
});

test('reports failure when the clipboard rejects', async () => {
  const clipboard = { writeText: vi.fn().mockRejectedValue(new Error('no')) };

  const result = await copyText('npm i x', clipboard);

  expect(result).toBe(false);
});

test('reports failure when there is no clipboard', async () => {
  const clipboard = undefined;

  const result = await copyText('npm i x', clipboard);

  expect(result).toBe(false);
});
