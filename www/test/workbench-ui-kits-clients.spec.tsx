// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

for (const framework of ['react', 'angular'] as const) {
  test(`${framework} UI lessons use a real kit with shared schemas and guarded application actions`, () => {
    const source = readFileSync(
      `www/examples/quickstart/${framework}/src/${framework === 'react' ? 'UiKitWorkbench.tsx' : 'app/ui-kit-workbench.ts'}`,
      'utf8',
    );

    expect(source).toContain(
      framework === 'react' ? 'useUiKit(' : 'createUiKit(',
    );
    expect(source).toContain(
      framework === 'react' ? 'components: [kit]' : 'components: [this.kit]',
    );
    expect(source).toContain('workbenchUiPlanProps');
    expect(source).toContain('registryMap: kit.registry');
    expect(source).toContain('serializedSchema: kit.serializedSchema');
    expect(source).toContain('data-kit-fallback');
    expect(source).toContain('PlanReading');
    expect(source).toContain('StepsCard');
    expect(source).toContain('canAcceptSummary');
    expect(source).toContain('application.revision');
    expect(source).toContain('getSnapshot().application');
  });
}
