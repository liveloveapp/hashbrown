import { describe, expect, test } from 'vitest';
import { resolve } from 'node:path';
import { extractToolSchemasForRoute } from '@b4run/core/node';

/**
 * Derives the assistant route's tool schemas the way `b4 typegen` does. B4's
 * compiler cannot see tsconfig path aliases, so a tool whose input type is
 * imported through `@invoicing/contracts` silently derives as `{}`. This pins
 * the render schema so that regression cannot slip through.
 */
const schemas = await extractToolSchemasForRoute({
  routeDir: resolve(import.meta.dirname, 'app/assistant'),
  sharedToolsDir: undefined,
});
const byName = new Map(schemas.map((s) => [s.name, s]));

type Loose = Record<string, unknown> & {
  readonly type?: string;
  readonly properties?: Record<string, Loose>;
  readonly required?: readonly string[];
  readonly items?: Loose;
  readonly anyOf?: readonly Loose[];
};
const loose = (value: unknown): Loose => value as Loose;

describe('assistant tool schemas', () => {
  test('exposes the seven current tools and none of the retired ones', () => {
    expect([...byName.keys()].sort()).toEqual([
      'aging',
      'customerStatement',
      'findRecords',
      'ledgerSummary',
      'monthlyTotals',
      'render',
      'unappliedPayments',
    ]);
  });

  test('every tool and every render property carries a description', () => {
    for (const schema of schemas) {
      expect(schema.description, schema.name).not.toBe('');
    }
    expect(byName.get('render')?.description).toContain('Call exactly once');
    const render = loose(byName.get('render')?.parameters);
    for (const [name, property] of Object.entries(render.properties ?? {})) {
      expect(property.description, `render.${name}`).toEqual(
        expect.stringMatching(/\S/),
      );
    }
  });

  test('derives the full render schema from the shared contract', () => {
    const render = loose(byName.get('render')?.parameters);
    expect(render.required).toContain('text');
    expect(render.properties?.text.type).toBe('string');

    const components = loose(render.properties?.components);
    expect(render.required).not.toContain('components');
    expect(components.type).toBe('array');
    const members = components.items?.anyOf ?? [];
    expect(members).toHaveLength(5);

    const member = (name: string) =>
      loose(members.find((m) => m.properties?.[name])?.properties?.[name]);

    const ledgerTable = member('LedgerTable');
    expect(ledgerTable.properties?.recordIds).toMatchObject({
      type: 'array',
      items: { type: 'string' },
    });
    expect(ledgerTable.required).toEqual(
      expect.arrayContaining(['title', 'recordIds']),
    );

    const trendChart = member('TrendChart');
    expect(trendChart.required).toContain('currency');
    expect(trendChart.required).not.toContain('customerId');
  });
});
