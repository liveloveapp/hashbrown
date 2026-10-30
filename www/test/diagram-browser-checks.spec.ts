import { expect, test } from 'vitest';
import { diagramIdsIn, diagramTargetsIn } from '../src/lib/element-inventory';
import {
  type DiagramGeometry,
  geometryIssues,
  inventoryIssues,
} from '../src/lib/diagram-checks';
const box = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});
const clean: DiagramGeometry = {
  fonts: [{ family: 'Hanken Grotesk', loaded: true }],
  canvas: box(0, 0, 720, 400),
  nodes: [{ id: 'one', box: box(20, 20, 220, 100) }],
  texts: [{ text: 'Title', node: 'one', box: box(40, 40, 80, 20) }],
  viewportWidth: 744,
  documentWidth: 1440,
  windowWidth: 1440,
  naturalWidth: 720,
};
test('inventory ignores code and preserves duplicate actual placements', () => {
  expect(
    diagramIdsIn(
      '`<hb-diagram diagram="fake">`\n\n```html\n<hb-diagram diagram="fake">\n```\n\n<hb-diagram diagram="real"> </hb-diagram>\n<hb-diagram diagram="real"> </hb-diagram>',
    ),
  ).toEqual(['real', 'real']);
});
test('inventory fails missing, duplicated, unknown and empty audit targets', () => {
  expect(inventoryIssues(['one', 'one'], ['one'], ['one'])).not.toEqual([]);
  expect(inventoryIssues(['one'], ['one', 'one'], ['one'])).not.toEqual([]);
  expect(inventoryIssues(['unknown'], ['unknown'], ['one'])).not.toEqual([]);
  expect(inventoryIssues([], [], ['one'])).not.toEqual([]);
});
test('clean geometry passes, mobile contained scrolling is allowed', () => {
  expect(geometryIssues(clean, true)).toEqual([]);
  expect(
    geometryIssues(
      { ...clean, viewportWidth: 286, documentWidth: 320, windowWidth: 320 },
      false,
    ),
  ).toEqual([]);
});
test('detects clipped text, node collision, text collision and labels over nodes', () => {
  expect(
    geometryIssues(
      { ...clean, texts: [{ text: 'Clip', box: box(710, 20, 80, 20) }] },
      true,
    ).join(),
  ).toContain('canvas');
  expect(
    geometryIssues(
      {
        ...clean,
        nodes: [...clean.nodes, { id: 'two', box: box(200, 20, 220, 100) }],
      },
      true,
    ).join(),
  ).toContain('nodes');
  expect(
    geometryIssues(
      {
        ...clean,
        texts: [
          ...clean.texts,
          { text: 'Type', node: 'one', box: box(100, 40, 80, 20) },
        ],
      },
      true,
    ).join(),
  ).toContain('text overlap');
  expect(
    geometryIssues(
      { ...clean, texts: [{ text: 'Edge', box: box(40, 40, 80, 20) }] },
      true,
    ).join(),
  ).toContain('label');
});
test('detects desktop overflow, page overflow and shrunken text', () => {
  expect(
    geometryIssues({ ...clean, viewportWidth: 680 }, true).join(),
  ).toContain('desktop');
  expect(
    geometryIssues({ ...clean, documentWidth: 1500 }, false).join(),
  ).toContain('page');
  expect(
    geometryIssues({ ...clean, naturalWidth: 1020 }, false).join(),
  ).toContain('shrunk');
});

test('fallback geometry cannot pass when a requested font failed', () => {
  expect(
    geometryIssues(
      { ...clean, fonts: [{ family: 'Hanken Grotesk', loaded: false }] },
      true,
    ).join(),
  ).toContain('font');
});

test('discovers nested docs routes and ignores pages containing only code examples', () => {
  expect(
    diagramTargetsIn([
      {
        sdk: 'react',
        slug: ['concept', 'components'],
        body: '<hb-diagram diagram="components"> </hb-diagram>',
      },
      {
        sdk: 'angular',
        slug: ['start', 'quick'],
        body: '`<hb-diagram diagram="example">`',
      },
    ]),
  ).toEqual([{ path: '/docs/react/concept/components', ids: ['components'] }]);
});
