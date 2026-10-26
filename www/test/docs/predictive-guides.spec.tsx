import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { readDoc, SDKS } from '../../src/lib/content';

test.each(SDKS)(
  '%s predictive suggestions start with a recorded task',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'predictive-actions'])?.body ?? '';

    const video = body.indexOf('<hb-docs-demo demo="predictive-suggestions">');

    expect(video).toBeGreaterThan(-1);
    expect(video).toBeLessThan(body.indexOf('\n## '));
    expect(body).toContain('/video/docs/predictive-suggestions-result.png');
    expect(body).toContain('Accept');
    expect(body).toContain('Dismiss');
    expect(body).toContain('contextId');
    expect(body).toContain('empty array');
    expect(body).toContain('calibrated');
  },
);

test.each(SDKS)(
  '%s predictive guide publishes the checked complete files',
  (sdk) => {
    const body = readDoc(sdk, ['recipes', 'predictive-actions'])?.body ?? '';
    const files = [
      'runtime/predictions.ts',
      sdk === 'react'
        ? 'react/src/PredictiveSuggestions.tsx'
        : 'angular/src/app/predictive-suggestions.ts',
    ];

    for (const file of files) {
      const section = body.slice(
        body.indexOf(`<hb-code-example header="${file}">`),
      );
      const snippet = section.match(/```[^\n]+\n([\s\S]*?)\n```/)?.[1];

      expect(snippet?.trim(), file).toBe(
        readFileSync(
          resolve(import.meta.dirname, '../../examples/quickstart', file),
          'utf8',
        ).trim(),
      );
      expect(body).toContain(`<hb-expander title="Complete ${file}">`);
    }
  },
);
