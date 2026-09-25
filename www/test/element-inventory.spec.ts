import { expect, test } from 'vitest';
import { customElementsIn } from '../src/lib/element-inventory';

test('counts custom elements outside code, ignoring ones inside fences and inline code', () => {
  const md =
    '<hb-code-example header="x">\n\n```html\n<hb-render-message />\n```\n\n</hb-code-example>\n\n`<hb-message>` and <hb-alert>hi</hb-alert>';

  const counts = customElementsIn(md);

  expect(counts).toEqual({ 'hb-code-example': 1, 'hb-alert': 1 });
});
