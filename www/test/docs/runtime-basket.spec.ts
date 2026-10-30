import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { readBasket } from '../../examples/quickstart/runtime/basket';
import { DOCS_DEMOS } from '../../src/components/elements/docs-demo-media';

test('reads three basket items in integer cents', () => {
  const input = { currency: 'USD' };

  const basket = readBasket(input);

  expect(basket.currency).toBe('USD');
  expect(basket.items).toHaveLength(3);
  expect(basket.items.reduce((total, item) => total + item.priceCents, 0)).toBe(
    4200,
  );
  expect(input).toEqual({ currency: 'USD' });
});

test('rejects invalid host arguments without trusting schema metadata', () => {
  const inputs = [
    undefined,
    null,
    'USD',
    [],
    {},
    { currency: 'EUR' },
    { currency: 1 },
    { currency: 'USD', admin: true },
  ];

  const reads = inputs.map((input) => () => readBasket(input));

  for (const read of reads) {
    expect(read).toThrow('Expected exactly { currency: "USD" }.');
  }
});

test('returns independent basket snapshots', () => {
  const first = readBasket({ currency: 'USD' });
  first.items[0].priceCents = 1;

  const second = readBasket({ currency: 'USD' });

  expect(second.items[0].priceCents).toBe(1800);
  expect(first.items).not.toBe(second.items);
});

for (const sdk of ['react', 'angular'] as const)
  test(`${sdk} runtime guide links checked canonical sources and explains direct execution`, () => {
    const body = readFileSync(
      resolve(
        import.meta.dirname,
        `../../content/docs/${sdk}/concept/runtime.md`,
      ),
      'utf8',
    );

    const client =
      sdk === 'react'
        ? 'react/src/RuntimeWorkbench.tsx'
        : 'angular/src/app/runtime-workbench.ts';

    for (const file of [
      client,
      'runtime/workbench-javascript.ts',
      'runtime/workbench-javascript-session.ts',
    ]) {
      expect(body).toContain(
        `https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/${file}`,
      );
      expect(
        readFileSync(
          resolve(import.meta.dirname, '../../examples/quickstart', file),
          'utf8',
        ).length,
      ).toBeGreaterThan(0);
    }
    expect(body).toContain('<hb-workbench lesson="javascript-runtime">');
    expect(body).not.toContain(`canonical-workbench-javascript-runtime-${sdk}`);
    expect(body).toContain(
      'does **not automatically validate arguments or results**',
    );
    expect(body).toContain(
      'The handler executes in your host application, outside QuickJS.',
    );
    expect(body).toContain(
      'Each call to `runtime.run` creates a new QuickJS runtime and context.',
    );
    expect(body).toContain('no model or provider request');
    expect(body).toContain('totalMinutes: snapshot.plan.steps.length * 15');
  });

for (const sdk of ['react', 'angular'] as const)
  test(`${sdk} runtime media publishes real execution disclosures and every accessible asset`, () => {
    const id = `canonical-workbench-javascript-runtime-${sdk}` as const;
    const media = DOCS_DEMOS[id];

    expect(media.recording).toContain('genuine QuickJS execution');
    expect(media.recording).toContain('no model or provider request');
    for (const suffix of [
      '.mp4',
      '.webm',
      '.vtt',
      '-poster.png',
      '-result.png',
      '-transcript.txt',
    ]) {
      const bytes = readFileSync(
        resolve(import.meta.dirname, '../../public/video/docs', id + suffix),
      );
      expect(bytes.length).toBeGreaterThan(0);
    }
    const captions = readFileSync(
      resolve(import.meta.dirname, '../../public/video/docs', id + '.vtt'),
      'utf8',
    );
    expect(captions).toMatch(/^WEBVTT/);
    expect(captions).toContain('No model request.');
  });
