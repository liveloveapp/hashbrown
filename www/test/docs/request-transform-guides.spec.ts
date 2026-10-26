import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

test('both request transformation guides teach the checked workflow and fail closed', () => {
  const sources = ['react', 'angular'].map((sdk) =>
    readFileSync(
      new URL(
        `../../content/docs/${sdk}/concept/transform-request-options.md`,
        import.meta.url,
      ),
      'utf8',
    ),
  );

  for (const source of sources) {
    expect(source).toContain('request-transformation');
    expect(source).toContain('How quickly will our team get support?');
    expect(source).toContain('request-transform-app.ts');
    expect(source).toContain('request-transform-server.ts');
    expect(source).toContain('one business day');
    expect(source).toContain('reasoning.encrypted_content');
    expect(source).toContain('<hb-expander');
    expect(source).not.toContain('return options;');
    expect(source).not.toContain('without exposing it');
    expect(source).not.toContain('<hb-expander open');
  }
});

test('Angular mounting replaces the Quickstart host with the checked component selector', () => {
  const page = readFileSync(
    new URL(
      '../../content/docs/angular/concept/transform-request-options.md',
      import.meta.url,
    ),
    'utf8',
  );
  const component = readFileSync(
    new URL(
      '../../examples/quickstart/angular/src/app/request-transform.ts',
      import.meta.url,
    ),
    'utf8',
  );
  const selector = component.match(/selector: '([^']+)'/)?.[1];

  expect(selector).toBe('app-request-transform');
  expect(page).toContain('angular/src/index.html');
  expect(page).toContain(`<${selector}></${selector}>`);
  expect(page).toContain('<app-root></app-root>');
});

test.each(['react', 'angular'])(
  '%s transformation guide opens with the recorded workflow before setup',
  (sdk) => {
    const body = readFileSync(
      resolve(
        import.meta.dirname,
        `../../content/docs/${sdk}/concept/transform-request-options.md`,
      ),
      'utf8',
    );

    const demo = body.indexOf('<hb-docs-demo demo="request-transformation">');

    expect(demo).toBeGreaterThan(-1);
    expect(demo).toBeLessThan(body.indexOf('\n## '));
    expect(body).toContain('/video/docs/request-transformation-result.png');
    expect(body).toContain('provider-native Responses events are scripted');
  },
);

test.each(['react', 'angular'])(
  '%s transformation guide publishes exact checked source in closed disclosures',
  (sdk) => {
    const body = readFileSync(
      resolve(
        import.meta.dirname,
        `../../content/docs/${sdk}/concept/transform-request-options.md`,
      ),
      'utf8',
    );
    const files = [
      'server/request-transform.ts',
      'server/request-transform-app.ts',
      'server/request-transform-server.ts',
      sdk === 'react'
        ? 'react/src/RequestTransform.tsx'
        : 'angular/src/app/request-transform.ts',
    ];

    for (const file of files) {
      const section = body.split(`<hb-code-example header="${file}">`)[1];
      const checked = readFileSync(
        resolve(import.meta.dirname, '../../examples/quickstart', file),
        'utf8',
      ).trim();
      const disclosed = section
        ?.match(/```[^\n]+\n([\s\S]*?)\n```/)?.[1]
        .trim();

      expect(body).toContain(`<hb-expander title="Complete ${file}">`);
      expect(body).not.toMatch(/<hb-expander[^>]*\bopen[=>\s]/);
      expect(disclosed).toBe(checked);
    }
  },
);

test.each(['react', 'angular'])(
  '%s transformation setup and recovery remain visible outside disclosures',
  (sdk) => {
    const body = readFileSync(
      resolve(
        import.meta.dirname,
        `../../content/docs/${sdk}/concept/transform-request-options.md`,
      ),
      'utf8',
    );

    const visible = body.replace(/<hb-expander\b[\s\S]*?<\/hb-expander>/g, '');

    for (const required of [
      'OPENAI_API_KEY',
      'OPENAI_MODEL',
      'APP_ORIGIN',
      'npx tsx --env-file=.env server/request-transform-server.ts',
      '/api/transformed-chat',
      '127.0.0.1:3001',
      'Ask the assistant',
      'Cancel',
      'one business day',
      'proxy',
      'authorization',
      'HTTP 401',
      'HTTP 403',
    ])
      expect(visible).toContain(required);
    expect(visible).toContain(`/docs/${sdk}/start/quick`);
    if (sdk === 'angular') {
      expect(visible).toContain('angular/src/main.ts');
      expect(visible).toContain(
        'bootstrapApplication(RequestTransform, appConfig)',
      );
      expect(visible).toContain('angular/src/index.html');
      expect(visible).toContain(
        '<app-request-transform></app-request-transform>',
      );
    } else {
      expect(visible).toContain('react/src/main.tsx');
      expect(visible).toContain('<HashbrownProvider');
      expect(visible).toContain('<RequestTransform />');
    }
  },
);
