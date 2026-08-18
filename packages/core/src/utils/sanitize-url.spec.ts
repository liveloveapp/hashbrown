import { sanitizeUrl } from './sanitize-url';

test('preserves safe absolute and relative URLs', () => {
  const urls = [
    'https://hashbrown.dev/docs',
    'http://localhost:4200',
    'mailto:hello@example.com',
    'tel:+15551234567',
    '/docs/getting-started',
    './relative',
    '../parent',
    '#section',
    '?tab=api',
    '//cdn.example.com/image.png',
  ];

  const results = urls.map((url) => sanitizeUrl(url));

  expect(results).toEqual(urls);
});

test('rejects unsafe and malformed URL protocols', () => {
  const urls = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '\njavascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    '',
    '   ',
  ];

  const results = urls.map((url) => sanitizeUrl(url));

  expect(results).toEqual(urls.map(() => undefined));
});
