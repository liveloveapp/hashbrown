import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  createParserEntry,
  createParserTranscript,
  selectParserModes,
} from '../../src/tools/docs-parser-fixtures';

test('parser recorder defaults to separate actual framework captures', () => {
  const selected = selectParserModes();

  expect(selected).toEqual(['json-parser-react', 'json-parser-angular']);
});

test('parser recorder selects explicit captures and rejects unknown modes', () => {
  const selected = selectParserModes('json-parser-angular');

  expect(selected).toEqual(['json-parser-angular']);
  expect(() => selectParserModes('json-parser-react,typo')).toThrow(/Unknown/);
  expect(() => selectParserModes('')).toThrow(/Unknown/);
});

test('parser entries mount compiled checked components without providers or copied parser code', () => {
  const react = createParserEntry('json-parser-react', '/checked');
  const angular = createParserEntry('json-parser-angular', '/checked');

  expect(react).toContain('/checked/react/src/JsonParserDemo.js');
  expect(react).toContain('createRoot');
  expect(angular).toContain('/checked/angular/src/app/json-parser-demo.js');
  expect(angular).toContain('bootstrapApplication');
  expect(angular).toContain('provideZonelessChangeDetection');
  expect(react + angular).not.toMatch(
    /HashbrownProvider|provideHashbrown|new Parser/,
  );
  expect(react + angular).toContain('__unmountParserDemo');
});

test('parser transcript identifies the framework actually captured and finite local stream', () => {
  const react = createParserTranscript('json-parser-react');
  const angular = createParserTranscript('json-parser-angular');

  expect(react).toContain('checked React component');
  expect(angular).toContain('checked Angular component');
  expect(angular).not.toContain('checked React component');
  for (const transcript of [react, angular]) {
    expect(transcript).toContain('finite local JSON stream');
    expect(transcript).toContain('no live model');
    expect(transcript).toContain('closing quote');
    expect(transcript).toContain('required field values are complete');
    expect(transcript).toContain('Stop');
    expect(transcript).toContain('Reset');
    expect(transcript).toContain('valid document');
  }
});

test('parser recording validates both clients before captures and preserves isolated masters', () => {
  const source = readFileSync(
    new URL('../../src/tools/record-docs-parser.ts', import.meta.url),
    'utf8',
  );

  expect(source).toContain("selectParserModes(process.env['DOCS_DEMO_MODES'])");
  expect(source).toContain('DOCS_SKIP_RECORDING');
  expect(source).toContain('randomUUID');
  expect(source).toContain('dist/docs-parser');
  expect(source).toContain('verifyParser');
  expect(source.indexOf('await verifyParser(')).toBeLessThan(
    source.indexOf('if (record)'),
  );
  expect(source).toContain('encodeRecipeVideo');
  expect(source).toContain('cropRecipeScreenshot');
  expect(source).toContain('createParserTranscript(mode)');
  expect(source).toContain('createParserCaptions(phases, media.duration)');
  expect(source).toContain('1440');
  expect(source).toContain('900');
  expect(source).not.toMatch(/new Parser|provideHashbrown|HashbrownProvider/);
});

test('parser browser checks cover partial fields, adverse inputs, ownership and recovery', () => {
  const source = readFileSync(
    new URL('../../src/tools/docs-parser-browser.ts', import.meta.url),
    'utf8',
  );

  for (const marker of [
    'parser-city',
    'parser-forecast',
    'parser-alert',
    'malformed',
    'schema-invalid',
    'truncated',
    'Stop',
    'Reset',
    '__unmountParserDemo',
  ])
    expect(source).toContain(marker);
  expect(source).toContain('not.toHaveText');
  expect(source).toContain('toHaveCount');
});
