import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { readDoc, SDKS } from '../../src/lib/content';

const examples = resolve(import.meta.dirname, '../../examples/quickstart');

test.each(SDKS)(
  '%s quickstart teaches a complete trusted-component journey',
  (sdk) => {
    const body = readDoc(sdk, ['start', 'quick'])?.body ?? '';

    const video = body.indexOf('<hb-docs-demo demo="welcome-card">');
    const firstSection = body.indexOf('\n## ');

    expect(video).toBeGreaterThan(-1);
    expect(video).toBeLessThan(firstSection);
    expect(body).toContain('/video/docs/welcome-card-result.png');
    expect(body).toContain('WelcomeCard');
    expect(body).toContain('OPENAI_API_KEY');
    expect(body).toContain('OPENAI_MODEL');
    expect(body).toContain('/api/chat');
    expect(body).toContain('## Before we start');
    expect(body).toContain('## If the card does not appear');
    expect(body).not.toContain('UseChatOptions');
    expect(body).not.toContain('## Beyond Chat');
  },
);

test.each(SDKS)(
  '%s introduction leads to generating a trusted component',
  (sdk) => {
    const body = readDoc(sdk, ['start', 'intro'])?.body ?? '';

    expect(body).toContain('WelcomeCard');
    expect(body).toContain('start/quick');
    expect(body).not.toContain('Getting started and text generation');
  },
);

test.each(SDKS)(
  '%s quickstart code matches the runnable example files',
  (sdk) => {
    const body = readDoc(sdk, ['start', 'quick'])?.body ?? '';
    const files =
      sdk === 'react'
        ? [
            'src/WelcomeCard.tsx',
            'src/App.tsx',
            'src/main.tsx',
            'vite.config.ts',
          ]
        : [
            'src/app/welcome-card.ts',
            'src/app/app.ts',
            'src/app/app.config.ts',
            'src/main.ts',
            'proxy.conf.json',
          ];
    const mappings = [
      ...files.map((file) => [file, `${sdk}/${file}`]),
      ['server.ts', 'server/server.ts'],
    ];

    for (const [header, file] of mappings) {
      const marker = `<hb-code-example header="${header}">`;
      const section = body.slice(body.indexOf(marker));
      const snippet = section.match(/```[^\n]+\n([\s\S]*?)\n```/)?.[1];

      expect(body, header).toContain(marker);
      expect(snippet?.trim(), header).toBe(
        readFileSync(resolve(examples, file), 'utf8').trim(),
      );
    }
  },
);

test.each(SDKS)(
  '%s fundamentals uses the checked conversation example',
  (sdk) => {
    const body = readDoc(sdk, ['concept', 'ai-basics'])?.body ?? '';
    const file =
      sdk === 'react'
        ? 'react/src/Conversation.tsx'
        : 'angular/src/app/conversation.ts';
    const snippet = body.match(/```(?:tsx|ts)\n([\s\S]*?)\n```/)?.[1];

    expect(snippet?.trim()).toBe(
      readFileSync(resolve(examples, file), 'utf8').trim(),
    );
    expect(body).toContain('<hb-docs-demo demo="conversation">');
    expect(body).not.toContain('retry()');
  },
);
