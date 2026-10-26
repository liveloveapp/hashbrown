import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { readDoc, SDKS } from '../../src/lib/content';

test.each(SDKS)(
  '%s agent recipe leads with its recorded routing workflow',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'decisions-in-agents'])?.body ?? '';

    const demo = body.indexOf('<hb-docs-demo demo="agent-routing">');

    expect(demo).toBeGreaterThan(-1);
    expect(demo).toBeLessThan(body.indexOf('\n## '));
    expect(body).toContain('<hb-docs-demo demo="agent-fallback">');
    expect(body).toContain('/video/docs/agent-routing-result.png');
    expect(body).toContain('scripted decision');
  },
);

test.each(SDKS)(
  '%s agent recipe includes the exact checked source in closed disclosures',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'decisions-in-agents'])?.body ?? '';
    const files = [
      'server/agent-routing.ts',
      'server/agent-app.ts',
      'server/agent-server.ts',
      sdk === 'react'
        ? 'react/src/AgentDecisions.tsx'
        : 'angular/src/app/agent-decisions.ts',
    ];

    for (const file of files) {
      const section = body.split(`<hb-code-example header="${file}">`)[1];
      const source = readFileSync(
        resolve(import.meta.dirname, '../../examples/quickstart', file),
        'utf8',
      ).trim();

      expect(body).toContain(`<hb-expander title="Complete ${file}">`);
      expect(body).not.toMatch(/<hb-expander[^>]*\bopen[=>\s]/);
      expect(section?.match(/```[^\n]+\n([\s\S]*?)\n```/)?.[1].trim()).toBe(
        source,
      );
    }
  },
);

test.each(SDKS)(
  '%s agent setup keeps configuration and recovery visible',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'decisions-in-agents'])?.body ?? '';

    const visible = body.replace(/<hb-expander\b[\s\S]*?<\/hb-expander>/g, '');

    for (const required of [
      'TYPESAFE_API_KEY',
      'TYPESAFE_MODEL',
      '/api/agent',
      '127.0.0.1:3001',
      'HB-1042',
      '0.7',
      'Run agent',
      'Cancel',
      'authorization',
      'confidence',
      'DecisionTransport',
      'Recipe B: Decisions over AG-UI',
    ]) {
      expect(visible).toContain(required);
    }
    expect(visible).toContain(`/docs/${sdk}/recipes/ui-selection`);
    expect(visible).toContain(`/docs/${sdk}/platform/typesafe`);
    expect(body).not.toContain('async function* readEvents');
    expect(body).not.toContain('jev-1.14.0');
    if (sdk === 'angular') {
      expect(visible).toContain('angular/src/index.html');
      expect(visible).toContain('<app-agent-decisions></app-agent-decisions>');
    }
  },
);
