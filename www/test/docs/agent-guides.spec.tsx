import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { readDoc, SDKS } from '../../src/lib/content';

test.each(SDKS)(
  '%s agent recipe leads with real framework-specific routing footage',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'decisions-in-agents'])?.body ?? '';

    const demo = body.indexOf(
      `<hb-docs-demo demo="canonical-workbench-agent-decisions-${sdk}">`,
    );

    expect(demo).toBeGreaterThan(-1);
    expect(demo).toBeLessThan(body.indexOf('\n## '));
    expect(body).toContain(
      `canonical-workbench-agent-decisions-${sdk}-result.png`,
    );
    expect(body).toContain('real TypeSafe');
    expect(body).not.toContain('scripted decision');
  },
);

test.each(SDKS)(
  '%s agent recipe links the actual checked routing and client sources',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'decisions-in-agents'])?.body ?? '';
    const files = [
      'server/workbench-agent.ts',
      'runtime/workbench-agent.ts',
      'runtime/workbench-authoring.ts',
      sdk === 'react'
        ? 'react/src/AuthoringWorkbench.tsx'
        : 'angular/src/app/authoring-workbench.ts',
    ];

    for (const file of files) {
      expect(body).toContain(
        `https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/${file}`,
      );
      expect(
        existsSync(
          resolve(import.meta.dirname, '../../examples/quickstart', file),
        ),
      ).toBe(true);
    }
  },
);

test.each(SDKS)(
  '%s agent recipe keeps classifier configuration and trust boundaries visible',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'decisions-in-agents'])?.body ?? '';

    for (const required of [
      'TYPESAFE_API_KEY',
      'TYPESAFE_MODEL',
      '0.75',
      'authorization',
      'confidence',
      'whole',
      'fixed handler',
      'Cancellation',
      'Replay',
    ])
      expect(body).toContain(required);
    expect(body).toContain(`/docs/${sdk}/recipes/ui-selection`);
    expect(body).toContain(`/docs/${sdk}/platform/typesafe`);
  },
);
