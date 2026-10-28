import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { listDocs, readDoc, SDKS } from '../../src/lib/content';

test.each(SDKS)(
  '%s discovers both Threadplane integration and migration with reciprocal links',
  (sdk) => {
    const slugs = listDocs(sdk).map((slug) => slug.join('/'));
    const recipe = readDoc(sdk, ['recipes', 'threadplane']);
    const migration = readDoc(sdk, ['migrations', 'threadplane']);

    expect(slugs).toContain('recipes/threadplane');
    expect(slugs).toContain('migrations/threadplane');
    expect(recipe?.description).toBeTruthy();
    expect(migration?.description).toBeTruthy();
    expect(recipe?.body).toContain(`/docs/${sdk}/migrations/threadplane`);
    expect(migration?.body).toContain(`/docs/${sdk}/recipes/threadplane`);
    for (const page of [recipe, migration]) {
      expect(page?.body).not.toMatch(/\bpreview\b/i);
    }
  },
);

test.each(SDKS)(
  '%s Threadplane recipe opens with its own installed-consumer recording',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'threadplane'])?.body ?? '';
    const id = `canonical-workbench-threadplane-${sdk}`;

    const opening = body.indexOf(`<hb-docs-demo demo="${id}">`);

    expect(opening).toBeGreaterThan(-1);
    expect(opening).toBeLessThan(body.indexOf('\n## '));
    expect(body).toContain(`/video/docs/${id}-result.png`);
    expect(body).toContain('installed');
    expect(body).toContain('real provider output');
    expect(body).toContain('application revision stays at zero');
    expect(body).toContain('actual protocol events');
  },
);

test('React Threadplane integration preserves Hashbrown execution with real source-workspace chat components', () => {
  const body = readDoc('react', ['recipes', 'threadplane'])?.body ?? '';
  const code = [...body.matchAll(/```(?:tsx?|jsx?)\n([\s\S]*?)\n```/g)]
    .map((match) => match[1])
    .join('\n');

  expect(code).toContain("from '@hashbrownai/react'");
  expect(code).toContain("from '@threadplane/react/chat'");
  expect(code).toContain('useChat(');
  expect(code).toContain('<TextTranscript');
  expect(code).toContain('<ChatInput');
  expect(code).toContain('onSubmit=');
  expect(code).toContain('onStop=');
  expect(code).toContain('isSending');
  expect(body).toContain('libs/react');
  expect(body).not.toMatch(
    /npm (?:install|add)[^\n]*@threadplane\/(?:react|core|content)/,
  );
  expect(code).not.toContain('createSession(');
  expect(code).not.toContain('as AgentSession');
});

test('Angular Threadplane integration connects its full chat to the standard Hashbrown endpoint', () => {
  const body = readDoc('angular', ['recipes', 'threadplane'])?.body ?? '';
  const code = [...body.matchAll(/```(?:tsx?|jsx?)\n([\s\S]*?)\n```/g)]
    .map((match) => match[1])
    .join('\n');

  expect(code).toContain("from '@threadplane/ag-ui'");
  expect(code).toContain("from '@threadplane/chat'");
  expect(code).toContain('provideAgent(');
  expect(code).toContain('injectAgent(');
  expect(code).toContain("url: '/api/chat'");
  expect(code).toContain('<chat [agent]="agent"');
  expect(code).toContain('ChangeDetectionStrategy.OnPush');
  expect(body).toContain('@threadplane/chat/themes/default-light.css');
  expect(code).not.toContain('chatResource(');
});

test('React local source-package installation copies packages into the frontend dependency tree', () => {
  const body = readDoc('react', ['recipes', 'threadplane'])?.body ?? '';
  const commands = [...body.matchAll(/```sh\n([\s\S]*?)\n```/g)]
    .map((match) => match[1])
    .join('\n');
  const installation = commands
    .split('\n')
    .find(
      (line) =>
        line.startsWith('npm install ') &&
        line.includes('../threadplane/dist/libs/react'),
    );

  expect(installation).toBeDefined();
  expect(installation).toMatch(/\s--install-links(?:\s|$)/);
  for (const name of ['core', 'content', 'react']) {
    expect(installation).toContain(`../threadplane/dist/libs/${name}`);
  }
});

test.each(SDKS)(
  '%s Threadplane migration links execution, history, tool and generated-component boundaries',
  (sdk) => {
    const body = readDoc(sdk, ['migrations', 'threadplane'])?.body ?? '';
    const slugs = [
      ['recipes', 'public-endpoint'],
      ['concept', 'message-history'],
      ['concept', 'functions'],
      ['concept', 'components'],
    ];

    for (const slug of slugs) {
      expect(readDoc(sdk, slug)).toBeDefined();
      expect(body).toContain(`/docs/${sdk}/${slug.join('/')}`);
    }
    expect(body).toContain('system');
    expect(body).toContain('authorization');
    expect(body).toContain('thread');
  },
);

test.each(SDKS)(
  '%s Threadplane guide publishes its exact checked component and mounting source',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'threadplane'])?.body ?? '';
    const files =
      sdk === 'react'
        ? [
            ['src/ThreadplaneChat.tsx', 'react/src/ThreadplaneChat.tsx'],
            ['src/main.tsx', 'react/src/main.tsx'],
          ]
        : [
            [
              'src/app/threadplane-chat.ts',
              'angular/src/app/threadplane-chat.ts',
            ],
            ['src/main.ts', 'angular/src/main.ts'],
          ];

    for (const [header, path] of files) {
      const section = body.split(`<hb-code-example header="${header}">`)[1];
      const checked = readFileSync(
        resolve(
          import.meta.dirname,
          '../../examples/threadplane-consumers',
          path,
        ),
        'utf8',
      ).trim();

      expect(section?.match(/```[^\n]+\n([\s\S]*?)\n```/)?.[1].trim()).toBe(
        checked,
      );
      expect(body).toContain(`<hb-expander title="Complete ${header}">`);
      expect(body).not.toMatch(/<hb-expander[^>]*\bopen[=>\s]/);
    }
  },
);

test.each(SDKS)(
  '%s Threadplane migration points to its own recorded installation walkthrough',
  (sdk) => {
    const body = readDoc(sdk, ['migrations', 'threadplane'])?.body ?? '';

    expect(body).toContain(`/docs/${sdk}/recipes/threadplane`);
    expect(body).toContain(`canonical-workbench-threadplane-${sdk}`);
  },
);

test('React Stop instructions match the observed Hashbrown 0.8.0 cancellation behavior', () => {
  const recipe = readDoc('react', ['recipes', 'threadplane'])?.body ?? '';
  const migration = readDoc('react', ['migrations', 'threadplane'])?.body ?? '';

  for (const body of [recipe, migration]) {
    expect(body).toContain('0.8.0');
    expect(body).toContain('unfinished assistant reply is removed');
    expect(body).toContain('completed turns');
    expect(body).not.toContain('Text already received stays');
  }
});

test('Angular Stop instructions match the observed Threadplane 0.3.3 retention behavior', () => {
  const recipe = readDoc('angular', ['recipes', 'threadplane'])?.body ?? '';

  expect(recipe).toContain('0.3.3');
  expect(recipe).toContain('Stop generating');
  expect(recipe).toContain('Text already received stays in the conversation');
});
