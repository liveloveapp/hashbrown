import { expect, test } from 'vitest';
import {
  LAYOUT_VIEWPORTS,
  layoutIssues,
  type LayoutSnapshot,
} from '../../src/lib/mobile-layout';

const phone = LAYOUT_VIEWPORTS[1];
const tablet = LAYOUT_VIEWPORTS[2];

function snapshot(overrides: Partial<LayoutSnapshot> = {}): LayoutSnapshot {
  return {
    page: '/docs',
    viewport: phone,
    scrollWidth: phone.width,
    clipped: [],
    targets: [],
    texts: [],
    inputs: [],
    covered: [],
    gutter: 16,
    edges: [],
    ...overrides,
  };
}

test('a page that fits has no issues', () => {
  const fits = snapshot({
    targets: [{ label: 'menu', width: 44, height: 44 }],
    texts: [{ label: 'p', fontSize: 16 }],
    inputs: [{ label: 'email', fontSize: 16 }],
  });

  const issues = layoutIssues(fits);

  expect(issues).toEqual([]);
});

test('a document wider than the viewport scrolls sideways', () => {
  const wide = snapshot({ scrollWidth: 400 });

  const issues = layoutIssues(wide);

  expect(issues.map((issue) => issue.rule)).toEqual(['page-scroll']);
});

test('content past its clipping edge is reported, a pixel of rounding is not', () => {
  const clipped = snapshot({
    clipped: [
      { label: 'symbol', right: 439, edge: 375 },
      { label: 'card', right: 375.6, edge: 375 },
    ],
  });

  const issues = layoutIssues(clipped);

  expect(issues).toEqual([
    {
      rule: 'clipped',
      page: '/docs',
      viewport: 'phone-375',
      detail: 'symbol ends at 439px, cut at 375px',
    },
  ]);
});

test('phones need 44px targets', () => {
  const small = snapshot({
    targets: [
      { label: 'copy', width: 18, height: 18 },
      { label: 'tab', width: 82, height: 32 },
      { label: 'link', width: 120, height: 43.8 },
    ],
  });

  const issues = layoutIssues(small);

  expect(issues.map((issue) => issue.detail)).toEqual([
    'copy is 18x18, under 44px',
    'tab is 82x32, under 44px',
  ]);
});

test('wider screens need 24px targets', () => {
  const desktop = snapshot({
    viewport: tablet,
    scrollWidth: tablet.width,
    targets: [
      { label: 'nav', width: 60, height: 36 },
      { label: 'copy', width: 18, height: 18 },
    ],
  });

  const issues = layoutIssues(desktop);

  expect(issues.map((issue) => issue.detail)).toEqual([
    'copy is 18x18, under 24px',
  ]);
});

test('text under 12px and fields under 16px are reported', () => {
  const tiny = snapshot({
    texts: [
      { label: 'code', fontSize: 10.5 },
      { label: 'caption', fontSize: 12 },
    ],
    inputs: [{ label: 'email', fontSize: 15 }],
  });

  const issues = layoutIssues(tiny);

  expect(issues.map((issue) => [issue.rule, issue.detail])).toEqual([
    ['small-text', 'code is 10.5px'],
    ['input-zoom', 'email is 15px'],
  ]);
});

test('a control drawn over in an open overlay is reported', () => {
  const covered = snapshot({
    covered: [{ label: 'Quick start', by: 'announcement' }],
  });

  const issues = layoutIssues(covered);

  expect(issues.map((issue) => issue.detail)).toEqual([
    'Quick start is under announcement',
  ]);
});

test('content that starts off the gutter is reported, a pixel of rounding is not', () => {
  const offGrid = snapshot({
    edges: [
      { label: 'logo', inset: 16 },
      { label: 'h1 "useUiChat"', inset: 24 },
      { label: 'footer', inset: 16.6 },
    ],
  });

  const issues = layoutIssues(offGrid);

  expect(issues).toEqual([
    {
      rule: 'off-gutter',
      page: '/docs',
      viewport: 'phone-375',
      detail: 'h1 "useUiChat" starts 24px in, the gutter is 16px',
    },
  ]);
});
