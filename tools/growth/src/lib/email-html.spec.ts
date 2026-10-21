import { expect, test } from 'vitest';

import {
  assertPlainHtml,
  renderPlainHtml,
  renderPlainText,
} from './email-html.ts';

const unsubscribeUrl = 'https://hashbrown.dev/_/unsubscribe?token=g1.abc.def';
const footer = `<p>You can unsubscribe <a href="${unsubscribeUrl}">here</a>.</p>`;

test('renderPlainHtml paragraphs, line breaks, links and the unsubscribe footer', () => {
  const text =
    'Hey Ada,\n\nRead https://hashbrown.dev/docs.\nThanks & <cheers>\n\nSee http://example.com';

  const html = renderPlainHtml({ text, unsubscribeUrl, signature: 'Brian' });

  expect(html).toBe(
    [
      '<p>Hey Ada,</p>',
      '<p>Read <a href="https://hashbrown.dev/docs">https://hashbrown.dev/docs</a>.<br>Thanks &amp; &lt;cheers&gt;</p>',
      '<p>See http://example.com</p>',
      '<p>Brian</p>',
      '<p>--</p>',
      footer,
    ].join('\n'),
  );
  expect(assertPlainHtml(html, unsubscribeUrl)).toBe(html);
});

test('renderPlainText appends the signature and the unsubscribe URL', () => {
  const text = 'Hey Ada,\n\nHello.';

  const rendered = renderPlainText({
    text,
    unsubscribeUrl,
    signature: 'Brian',
  });

  expect(rendered).toBe(
    `Hey Ada,\n\nHello.\n\nBrian\n\n--\n\nYou can unsubscribe here: ${unsubscribeUrl}`,
  );
});

test('assertPlainHtml rejects images, scripts, styles, event handlers, http links, and a missing unsubscribe anchor', () => {
  const cases = [
    `<p><img alt="x"></p>${footer}`,
    `<script>alert(1)</script>${footer}`,
    `<style>p{}</style>${footer}`,
    `<p onclick="x()">hi</p>${footer}`,
    `<p style="color:red">hi</p>${footer}`,
    `<p data="1">hi</p>${footer}`,
    `<!-- note -->${footer}`,
    `<!doctype html>${footer}`,
    `<div>hi</div>${footer}`,
    `<p><a href="http://example.com">x</a></p>${footer}`,
    '<p>no unsubscribe link</p>',
    `${footer}${footer}`,
    `<p>${'x'.repeat(40_001)}</p>${footer}`,
  ];

  const outcomes = cases.map((html) => {
    try {
      assertPlainHtml(html, unsubscribeUrl);
      return 'accepted';
    } catch {
      return 'rejected';
    }
  });

  expect(outcomes).toEqual(cases.map(() => 'rejected'));
});
