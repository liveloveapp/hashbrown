import { type MagicTextFragment, prepareMagicText } from './magic-text';

type Citation = { id: number | string; url: string };

const fragmentDuration = 220;
const defaultLinkTarget = '_blank';
const defaultLinkRel = 'noopener noreferrer';

describe('MagicTextRenderer snapshot (Angular sample parity)', () => {
  it('matches the current Angular sample rendering output', () => {
    const citations: Citation[] = [
      { id: 1, url: 'https://example.com/one' },
      { id: 'alpha', url: 'https://example.com/alpha' },
    ];

    const html = renderMagicTextRenderer(
      'Hello **world**! Check [docs](https://example.com) and [^1] more text `code`',
      citations,
    );

    expect(html).toMatchSnapshot();
  });

  it('shows provisional and whitespace behavior for streaming output', () => {
    const html = renderMagicTextRenderer('Streaming **incomplet', []);

    expect(html).toMatchSnapshot();
  });
});

function renderMagicTextRenderer(input: string, citations: Citation[]): string {
  const prepared = prepareMagicText(input);
  const fragments = prepared.fragments;
  const citationLookup = buildCitationLookup(citations);

  return fragments
    .map((fragment, index) => {
      const before = renderWhitespace(fragments, index, 'before');
      const after = renderWhitespace(fragments, index, 'after');

      if (fragment.kind === 'text') {
        return [before, renderTextFragment(fragment), after].join('');
      }

      return [
        before,
        renderCitationFragment(fragment, citationLookup),
        after,
      ].join('');
    })
    .join('');
}

function renderTextFragment(
  fragment: Extract<MagicTextFragment, { kind: 'text' }>,
): string {
  const classes = ['fragment'];
  if (fragment.state === 'provisional') {
    classes.push('fragment--provisional');
  }
  if (fragment.isStatic) {
    classes.push('fragment--static');
  }

  const style = [
    '--fragment-delay: 0ms',
    `--fragment-duration: ${fragment.isStatic ? 0 : fragmentDuration}ms`,
  ].join(';');

  const content = renderWrappers(fragment, 0);

  const inner = fragment.marks.link ? renderLink(fragment, content) : content;

  return `<span class="${classes.join(' ')}" style="${style}">${inner}</span>`;
}

function renderLink(
  fragment: Extract<MagicTextFragment, { kind: 'text' }>,
  content: string,
): string {
  const link = fragment.marks.link;
  if (!link) {
    return content;
  }
  const attrs = [
    `href="${escapeHtml(link.href)}"`,
    link.title ? `title="${escapeHtml(link.title)}"` : undefined,
    link.ariaLabel ? `aria-label="${escapeHtml(link.ariaLabel)}"` : undefined,
    `rel="${escapeHtml(link.rel ?? defaultLinkRel)}"`,
    `target="${escapeHtml(link.target ?? defaultLinkTarget)}"`,
  ]
    .filter(Boolean)
    .join(' ');

  return `<a ${attrs}>${content}</a>`;
}

function renderCitationFragment(
  fragment: Extract<MagicTextFragment, { kind: 'citation' }>,
  lookup: Map<string, Citation>,
): string {
  const style = [
    '--fragment-delay: 0ms',
    `--fragment-duration: ${fragmentDuration}ms`,
  ].join(';');

  const resolved = lookup.get(fragment.citation.id);
  if (resolved) {
    const anchor = [
      `class="citation-link"`,
      'data-allow-navigation="true"',
      `href="${escapeHtml(resolved.url)}"`,
      'rel="noopener noreferrer"',
      'target="_blank"',
      `title="${escapeHtml(fragment.text)}"`,
      `aria-label="${escapeHtml(fragment.text)}"`,
    ].join(' ');

    return [
      `<sup class="fragment citation" role="doc-noteref" style="${style}">`,
      `<a ${anchor}>`,
      `<app-citation-icon url="${escapeHtml(resolved.url)}"></app-citation-icon>`,
      `<span class="sr-only">${escapeHtml(fragment.text)}</span>`,
      `</a>`,
      `</sup>`,
    ].join('');
  }

  return [
    `<sup class="fragment citation" role="doc-noteref" style="${style}">`,
    `<span class="citation-placeholder" aria-label="${escapeHtml(fragment.text)}">`,
    `<span class="citation-placeholder-wrapper">`,
    `<span class="citation-placeholder-icon" aria-hidden="true"></span>`,
    `</span>`,
    `<span class="sr-only">${escapeHtml(fragment.text)}</span>`,
    `</span>`,
    `</sup>`,
  ].join('');
}

function renderWrappers(
  fragment: Extract<MagicTextFragment, { kind: 'text' }>,
  wrapperIndex: number,
): string {
  if (wrapperIndex < fragment.wrappers.length) {
    const wrapper = fragment.wrappers[wrapperIndex];
    const child = renderWrappers(fragment, wrapperIndex + 1);
    if (wrapper === 'strong') {
      return `<strong>${child}</strong>`;
    }
    return `<em>${child}</em>`;
  }

  return renderLeaf(fragment);
}

function renderLeaf(
  fragment: Extract<MagicTextFragment, { kind: 'text' }>,
): string {
  const text = escapeHtml(fragment.text);
  if (fragment.marks.code) {
    return `<code class="fragment-text fragment-text--code">${text}</code>`;
  }
  return `<span class="fragment-text">${text}</span>`;
}

function renderWhitespace(
  fragments: MagicTextFragment[],
  index: number,
  position: 'before' | 'after',
): string {
  const fragment = fragments[index];
  if (!fragment) {
    return '';
  }
  const render =
    position === 'before'
      ? fragment.renderWhitespace.before
      : fragment.renderWhitespace.after;
  if (!render) {
    return '';
  }
  const cls =
    position === 'before' ? 'fragment-space--before' : 'fragment-space--after';
  return `<span class="fragment-space ${cls}" aria-hidden="true">&nbsp;</span>`;
}

function buildCitationLookup(citations: Citation[]): Map<string, Citation> {
  const lookup = new Map<string, Citation>();
  for (const citation of citations ?? []) {
    if (
      citation == null ||
      (typeof citation.id !== 'number' && typeof citation.id !== 'string')
    ) {
      continue;
    }
    const id = String(citation.id).trim();
    const url = typeof citation.url === 'string' ? citation.url.trim() : '';
    if (!id || !url) {
      continue;
    }
    lookup.set(id, { id, url });
  }
  return lookup;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
