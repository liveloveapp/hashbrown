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
      expect(page?.body).not.toMatch(/<hb-docs-demo[^>]*demo="threadplane/);
    }
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
