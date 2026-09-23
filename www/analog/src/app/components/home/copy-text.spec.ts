import { expect, test, vi } from 'vitest';
import { copyText } from './copy-text';

test('writes the text to the clipboard and tracks the event', async () => {
  const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
  const track = vi.fn();

  const result = await copyText('npm i x', 'install-copied-react', {
    clipboard,
    track,
  });

  expect(result).toBe(true);
  expect(clipboard.writeText).toHaveBeenCalledWith('npm i x');
  expect(track).toHaveBeenCalledWith('install-copied-react');
});

test('reports failure and does not track when the clipboard rejects', async () => {
  const clipboard = { writeText: vi.fn().mockRejectedValue(new Error('no')) };
  const track = vi.fn();

  const result = await copyText('npm i x', 'install-copied-react', {
    clipboard,
    track,
  });

  expect(result).toBe(false);
  expect(track).not.toHaveBeenCalled();
});

test('reports failure when there is no clipboard', async () => {
  const track = vi.fn();

  const result = await copyText('npm i x', 'install-copied-react', {
    clipboard: undefined,
    track,
  });

  expect(result).toBe(false);
});
