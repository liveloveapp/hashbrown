import { expect, test } from 'vitest';
import { dynamic, GET } from '../../src/app/github-card/route';

test('the GitHub card is a static 1280x640 PNG', async () => {
  const response = await GET();

  const view = new DataView(await response.arrayBuffer());
  expect(dynamic).toBe('force-static');
  expect(response.headers.get('content-type')).toBe('image/png');
  expect({ width: view.getUint32(16), height: view.getUint32(20) }).toEqual({
    width: 1280,
    height: 640,
  });
});
