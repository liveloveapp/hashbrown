import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { readDoc, SDKS } from '../../src/lib/content';

const examples = resolve(import.meta.dirname, '../../examples/quickstart');

test.each(SDKS)(
  '%s quickstart teaches a complete trusted-component journey',
  (sdk) => {
    const body = readDoc(sdk, ['start', 'quick'])?.body ?? '';

    const afterTitle = body.split(/^# .+$/m)[1]?.trimStart() ?? '';

    expect(afterTitle).not.toMatch(/^<hb-docs-demo\b/);
    expect(body).not.toContain(
      `/video/docs/canonical-workbench-first-plan-${sdk}-result.png`,
    );
    expect(body).toContain('SummaryCard');
    expect(body).toContain('two-step plan');
    expect(body).not.toContain('WelcomeCard');
    expect(body).toContain('OPENAI_API_KEY');
    expect(body).toContain('OPENAI_MODEL');
    expect(body).toContain('/api/chat');
    expect(body).toContain('## Before we start');
    expect(body.indexOf('<hb-workbench lesson="first-plan">')).toBeGreaterThan(
      body.indexOf('## Explore it in the workbench'),
    );
    expect(body).toContain('## If the card does not appear');
    expect(body).not.toContain('UseChatOptions');
    expect(body).not.toContain('## Beyond Chat');
  },
);

test.each(SDKS)(
  '%s introduction leads to generating a trusted component',
  (sdk) => {
    const body = readDoc(sdk, ['start', 'intro'])?.body ?? '';

    expect(body).toContain('two-step plan');
    expect(body).toContain('<hb-workbench lesson="first-plan">');
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
            'src/PlanCard.tsx',
            'src/FirstPlanApp.tsx',
            'src/first-plan-main.tsx',
            'vite.config.ts',
          ]
        : [
            'src/app/plan-card.ts',
            'src/app/first-plan-app.ts',
            'src/app/app.config.ts',
            'src/first-plan-main.ts',
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
  '%s fundamentals separates the reusable conversation from the workbench walkthrough',
  (sdk) => {
    const body = readDoc(sdk, ['concept', 'ai-basics'])?.body ?? '';
    const sections = body.split('## Explore it in the workbench');

    expect(sections).toHaveLength(2);
    expect(sections[0]).toContain('book club');
    expect(sections[0]).toMatch(/```(?:tsx|ts)\nimport /);
    expect(sections[1]).toContain('two-step plan');
    expect(sections[1]).toContain('<hb-workbench lesson="conversation">');
    expect(body).toContain('threadId');
    expect(body).toContain('runId');
    expect(body).toContain('page refresh');
    expect(body).not.toContain('retry()');
  },
);

test.each(SDKS)(
  '%s request path and instruction guides use actual canonical evidence',
  (sdk) => {
    const path = readDoc(sdk, ['start', 'how-it-works'])?.body ?? '';
    const instructions =
      readDoc(sdk, ['concept', 'system-instructions'])?.body ?? '';

    expect(path).toContain('<hb-workbench lesson="first-plan">');
    expect(path).toContain('SummaryCard');
    expect(path).toContain('AG-UI');
    expect(path).not.toContain('WelcomeCard');
    expect(instructions).toContain(
      '<hb-workbench lesson="system-instructions">',
    );
    expect(instructions).toContain('provider');
    expect(instructions).toContain('browser');
    expect(instructions).toContain('authorization');
    expect(instructions).toContain('two-step plan');
  },
);
