import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { readBasket } from '../../examples/quickstart/runtime/basket';

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

test('runtime guides publish the complete checked source and explicit validation boundary', () => {
  const cases = [
    { sdk: 'react', files: ['src/RuntimeDemo.tsx', 'src/useBasketChat.ts'] },
    {
      sdk: 'angular',
      files: ['src/app/runtime-demo.ts', 'src/app/create-basket-chat.ts'],
    },
  ];

  const pages = cases.map(({ sdk, files }) => ({
    body: readFileSync(
      resolve(
        import.meta.dirname,
        `../../content/docs/${sdk}/concept/runtime.md`,
      ),
      'utf8',
    ),
    files: files.map((file) => ({
      header: file,
      source: readFileSync(
        resolve(
          import.meta.dirname,
          `../../examples/quickstart/${sdk}/${file}`,
        ),
        'utf8',
      ).trim(),
    })),
  }));

  for (const { body, files } of pages) {
    for (const { header, source } of files) {
      const section = body.split(`<hb-code-example header="${header}">`)[1];
      expect(section?.match(/```[^\n]+\n([\s\S]*?)\n```/)?.[1]).toBe(source);
    }
    expect(body).toContain(
      'does **not automatically validate arguments or results**',
    );
    expect(body).toContain(
      'The handler executes in your host application, outside QuickJS.',
    );
    expect(body).toContain(
      'Each call to `runtime.run` creates a new QuickJS runtime and context.',
    );
    expect(body).not.toMatch(
      /Used to validate the (input arguments|return value)/,
    );
    expect(body).not.toContain(
      'The `handler` function is executed within the JS runtime',
    );
  }
});
