import { fireEvent, render } from '@testing-library/react';
import {
  createProseNodeRenderers,
  type ProseNodeRenderers,
  ProseRenderer,
} from './prose-renderer';

test('ProseRenderer renders markdown blocks and citations from the AST', () => {
  const { container } = render(
    <ProseRenderer isComplete segmenter={false}>
      {
        '# Title\n\n- one\n- two\n\nCite [^ref]\n\n[^ref]: Ref https://hashbrown.dev'
      }
    </ProseRenderer>,
  );

  const heading = container.querySelector('h1');
  const listItems = container.querySelectorAll('li');
  const citation = container.querySelector('sup a[role="doc-noteref"]');

  expect(heading?.textContent).toBe('Title');
  expect(listItems).toHaveLength(2);
  expect(citation?.getAttribute('href')).toBe('https://hashbrown.dev');
  expect(citation?.getAttribute('target')).toBe('_blank');
  expect(citation?.getAttribute('rel')).toBe('noopener noreferrer');
  expect(citation?.textContent).toBe('1');
});

test('ProseRenderer creates one span per parsed text segment', () => {
  const { container } = render(
    <ProseRenderer segmenter={{ granularity: 'grapheme' }}>
      ab
    </ProseRenderer>,
  );

  const segments = container.querySelectorAll('span.hb-prose-segment');

  expect(segments).toHaveLength(2);
  expect(segments[0]?.textContent).toBe('a');
  expect(segments[1]?.textContent).toBe('b');
});

test('ProseRenderer prefixes word joiner before punctuation after citations', () => {
  const { container } = render(
    <ProseRenderer isComplete segmenter={{ granularity: 'word' }}>
      {'Alpha[^a]; beta\n\n[^a]: Source https://hashbrown.dev'}
    </ProseRenderer>,
  );

  const segments = Array.from(
    container.querySelectorAll('span.hb-prose-segment'),
  );
  const punctuationSegment = segments.find(
    (segment) => segment.textContent?.includes(';') ?? false,
  );

  expect(punctuationSegment?.textContent?.startsWith('\u2060;')).toBe(true);
});

test('ProseRenderer keeps unresolved citation punctuation glued', () => {
  const { container } = render(
    <ProseRenderer isComplete segmenter={{ granularity: 'word' }}>
      {'Alpha[^missing].'}
    </ProseRenderer>,
  );

  const unresolvedCitation = container.querySelector(
    'sup[data-prose-node="citation-reference"]',
  );
  const unresolvedCitationButton = container.querySelector(
    'sup[data-prose-node="citation-reference"] button',
  );
  const segments = Array.from(
    container.querySelectorAll('span.hb-prose-segment'),
  );
  const punctuationSegment = segments.find(
    (segment) => segment.textContent?.includes('.') ?? false,
  );

  expect(unresolvedCitation?.textContent).toBe('1');
  expect(unresolvedCitationButton).toBeNull();
  expect(punctuationSegment?.textContent?.startsWith('\u2060.')).toBe(true);
});

test('ProseRenderer preserves existing segment dom identity across updates', () => {
  const { container, rerender } = render(
    <ProseRenderer segmenter={{ granularity: 'grapheme' }}>
      ab
    </ProseRenderer>,
  );

  const initialSegments = container.querySelectorAll(
    'span.hb-prose-segment',
  );
  const firstSegmentBefore = initialSegments[0];

  rerender(
    <ProseRenderer segmenter={{ granularity: 'grapheme' }}>
      abc
    </ProseRenderer>,
  );

  const nextSegments = container.querySelectorAll('span.hb-prose-segment');
  const firstSegmentAfter = nextSegments[0];

  expect(nextSegments).toHaveLength(3);
  expect(firstSegmentAfter).toBe(firstSegmentBefore);
});

test('ProseRenderer keeps optimistic word-tail segment identity as it grows', () => {
  const { container, rerender } = render(
    <ProseRenderer segmenter={{ granularity: 'word' }}>
      hello wo
    </ProseRenderer>,
  );

  const firstSegments = container.querySelectorAll(
    'span.hb-prose-segment',
  );
  const tailBefore = firstSegments[2];

  rerender(
    <ProseRenderer segmenter={{ granularity: 'word' }}>
      hello world
    </ProseRenderer>,
  );

  const nextSegments = container.querySelectorAll('span.hb-prose-segment');
  const tailAfter = nextSegments[2];

  expect(nextSegments).toHaveLength(3);
  expect(tailAfter).toBe(tailBefore);
  expect(tailAfter?.textContent).toBe('world');
});

test('ProseRenderer renders a caret at the end of an open paragraph when enabled', () => {
  const { container } = render(
    <ProseRenderer caret segmenter={false}>
      {'streaming paragraph'}
    </ProseRenderer>,
  );

  const paragraph = container.querySelector(
    'p[data-prose-node="paragraph"]',
  );
  const caret = container.querySelector('[data-prose-caret]');

  expect(paragraph?.textContent).toBe('streaming paragraph');
  expect(caret).not.toBeNull();
  expect(paragraph?.contains(caret)).toBe(true);
});

test('ProseRenderer hides the caret once parsing is complete', () => {
  const { container, rerender } = render(
    <ProseRenderer caret segmenter={false}>
      {'streaming paragraph'}
    </ProseRenderer>,
  );

  rerender(
    <ProseRenderer caret isComplete segmenter={false}>
      {'streaming paragraph'}
    </ProseRenderer>,
  );

  const caret = container.querySelector('[data-prose-caret]');

  expect(caret).toBeNull();
});

test('ProseRenderer does not render caret when only document root remains open', () => {
  const { container } = render(
    <ProseRenderer caret segmenter={false}>
      {'Paragraph\n\n'}
    </ProseRenderer>,
  );

  const paragraph = container.querySelector(
    'p[data-prose-node="paragraph"]',
  );
  const caret = container.querySelector('[data-prose-caret]');

  expect(paragraph?.textContent).toBe('Paragraph');
  expect(caret).toBeNull();
});

test('ProseRenderer renders the caret inside streaming leaf nodes', () => {
  const cases = [
    ['`code', 'inline-code'],
    ['$$x', 'math-display'],
    ['<div>\ncontent', 'html-block'],
    ['https://example.com', 'autolink'],
  ] as const;

  for (const [text, nodeType] of cases) {
    const { container, unmount } = render(
      <ProseRenderer caret segmenter={false}>
        {text}
      </ProseRenderer>,
    );
    const node = container.querySelector(
      `[data-prose-node="${nodeType}"]`,
    );
    const caret = container.querySelector('[data-prose-caret]');

    expect(node).not.toBeNull();
    expect(caret).not.toBeNull();
    expect(node?.contains(caret)).toBe(true);
    unmount();
  }
});

test('ProseRenderer allows overriding individual node renderers by node type', () => {
  const { container } = render(
    <ProseRenderer
      isComplete
      nodeRenderers={{
        paragraph: ({ children }) => (
          <section data-custom-node="paragraph">{children}</section>
        ),
        text: ({ node }) => (
          <mark data-custom-node="text">{node.text.toUpperCase()}</mark>
        ),
        citationReference: ({ citation }) => (
          <button type="button" data-custom-node="citation">
            {citation?.id}
          </button>
        ),
      }}
    >
      {'hello [^ref]\n\n[^ref]: Ref https://hashbrown.dev'}
    </ProseRenderer>,
  );

  const customParagraph = container.querySelector(
    'section[data-custom-node="paragraph"]',
  );
  const customText = container.querySelectorAll(
    'mark[data-custom-node="text"]',
  );
  const customCitation = container.querySelector(
    'button[data-custom-node="citation"]',
  );

  expect(customParagraph).not.toBeNull();
  expect(customText[0]?.textContent).toBe('HELLO ');
  expect(customCitation?.textContent).toBe('ref');
  expect(container.querySelector('p')).toBeNull();
});

test('ProseRenderer renders an empty root when there is no text', () => {
  const { container } = render(<ProseRenderer>{''}</ProseRenderer>);

  const root = container.querySelector('div[data-prose-root]');

  expect(root?.childElementCount).toBe(0);
});

test('ProseRenderer renders all heading levels', () => {
  const { container } = render(
    <ProseRenderer isComplete>
      {'# h1\n## h2\n### h3\n#### h4\n##### h5\n###### h6'}
    </ProseRenderer>,
  );

  const h1 = container.querySelector('h1');
  const h2 = container.querySelector('h2');
  const h3 = container.querySelector('h3');
  const h4 = container.querySelector('h4');
  const h5 = container.querySelector('h5');
  const h6 = container.querySelector('h6');

  expect(h1?.textContent).toBe('h1');
  expect(h2?.textContent).toBe('h2');
  expect(h3?.textContent).toBe('h3');
  expect(h4?.textContent).toBe('h4');
  expect(h5?.textContent).toBe('h5');
  expect(h6?.textContent).toBe('h6');
});

test('ProseRenderer renders block and inline node families', () => {
  const { container } = render(
    <ProseRenderer isComplete>
      {`> block

- one
3. three

| h1 | h2 |
| --- | --- |
| c1 | c2 |

[link](https://example.com "title")
https://hashbrown.dev

![alt](https://images.example.com/x.png "image-title")

\`inline\` *em* **strong** ~~strike~~
line one
line two  
line three

---

\`\`\`ts
const x = 1;
\`\`\``}
    </ProseRenderer>,
  );

  const blockquote = container.querySelector('blockquote');
  const unorderedList = container.querySelector('ul');
  const orderedList = container.querySelector('ol');
  const orderedListItem = orderedList?.querySelector('li');
  const table = container.querySelector('table');
  const tableHeaders = container.querySelectorAll('th');
  const tableCells = container.querySelectorAll('td');
  const markdownLink = container.querySelector('a[href="https://example.com"]');
  const autolink = container.querySelector('a[href="https://hashbrown.dev"]');
  const image = container.querySelector('img');
  const inlineCode = container.querySelector(
    'code[data-prose-node="inline-code"]',
  );
  const emphasis = container.querySelector('em');
  const strong = container.querySelector('strong');
  const strike = container.querySelector('s');
  const hardBreak = container.querySelector(
    'br[data-prose-node="hard-break"]',
  );
  const thematicBreak = container.querySelector(
    'hr[data-prose-node="thematic-break"]',
  );
  const codeBlock = container.querySelector('pre code[data-code-info="ts"]');
  const segments = container.querySelectorAll('span.hb-prose-segment');

  expect(blockquote?.textContent).toBe('block');
  expect(unorderedList?.querySelectorAll('li')).toHaveLength(1);
  expect(orderedList?.getAttribute('start')).toBe('3');
  expect(orderedListItem?.textContent).toBe('three');
  expect(table).not.toBeNull();
  expect(tableHeaders).toHaveLength(2);
  expect(tableCells).toHaveLength(2);
  expect(markdownLink?.getAttribute('title')).toBe('title');
  expect(markdownLink?.getAttribute('target')).toBe('_blank');
  expect(markdownLink?.getAttribute('rel')).toBe('noopener noreferrer');
  expect(autolink?.getAttribute('target')).toBe('_blank');
  expect(autolink?.getAttribute('rel')).toBe('noopener noreferrer');
  expect(autolink?.textContent).toBe('https://hashbrown.dev');
  expect(image?.getAttribute('alt')).toBe('alt');
  expect(image?.getAttribute('title')).toBe('image-title');
  expect(inlineCode?.textContent).toBe('inline');
  expect(emphasis?.textContent).toBe('em');
  expect(strong?.textContent).toBe('strong');
  expect(strike?.textContent).toBe('strike');
  expect(hardBreak).not.toBeNull();
  expect(thematicBreak).not.toBeNull();
  expect(codeBlock?.textContent).toContain('const x = 1;');
  expect(segments.length).toBeGreaterThan(0);
});

test('ProseRenderer renders Cacheplane task, reference, math, and HTML nodes', () => {
  const { container } = render(
    <ProseRenderer isComplete segmenter={false}>
      {`- [x] done

[reference][id]

[id]: https://example.com "title"

$x$

$$y$$

<span data-injected-html>safe</span>

<div>block</div>`}
    </ProseRenderer>,
  );

  const task = container.querySelector('li input[type="checkbox"]');
  const reference = container.querySelector(
    'a[data-prose-node="link-reference"]',
  );
  const inlineMath = container.querySelector(
    '[data-prose-node="math-inline"]',
  );
  const displayMath = container.querySelector(
    '[data-prose-node="math-display"]',
  );
  const inlineHtml = container.querySelector(
    '[data-prose-node="html-inline"]',
  );
  const blockHtml = container.querySelector(
    '[data-prose-node="html-block"]',
  );

  expect(task).toHaveProperty('checked', true);
  expect(task).toHaveProperty('disabled', true);
  expect(reference?.getAttribute('href')).toBe('https://example.com');
  expect(reference?.getAttribute('title')).toBe('title');
  expect(inlineMath?.textContent).toBe('$x$');
  expect(displayMath?.textContent).toBe('$$y$$');
  expect(inlineHtml?.textContent).toBe('<span data-injected-html>');
  expect(blockHtml?.textContent).toBe('<div>block</div>');
  expect(container.querySelector('[data-injected-html]')).toBeNull();
});

test('ProseRenderer removes unsafe link, citation, and image URLs', () => {
  const { container } = render(
    <ProseRenderer isComplete segmenter={false}>
      {`[link](javascript:alert)

![image](data:text/html,unsafe)

Cite [^bad]

[^bad]: [Source](vbscript:unsafe)`}
    </ProseRenderer>,
  );

  const link = container.querySelector('[data-prose-node="link"]');
  const image = container.querySelector('[data-prose-node="image"]');
  const citation = container.querySelector('sup a[role="doc-noteref"]');

  expect(link?.getAttribute('href')).toBeNull();
  expect(image?.getAttribute('src')).toBeNull();
  expect(citation).toBeNull();
});

test('ProseRenderer calls link click callback for links and autolinks', () => {
  const linkUrls: string[] = [];
  const { container } = render(
    <ProseRenderer
      isComplete
      onLinkClick={(event, url) => {
        event.preventDefault();
        linkUrls.push(url);
      }}
    >
      {'[link](https://example.com)\n\nhttps://hashbrown.dev'}
    </ProseRenderer>,
  );

  const markdownLink = container.querySelector('a[href="https://example.com"]');
  const autolink = container.querySelector('a[href="https://hashbrown.dev"]');
  if (markdownLink) {
    fireEvent.click(markdownLink);
  }
  if (autolink) {
    fireEvent.click(autolink);
  }

  expect(linkUrls).toEqual(['https://example.com', 'https://hashbrown.dev']);
});

test('ProseRenderer calls citation callback when a citation has a URL', () => {
  const clicked: string[] = [];
  const { container } = render(
    <ProseRenderer
      isComplete
      onCitationClick={(event, citation) => {
        event.preventDefault();
        clicked.push(`${citation.id}:${String(citation.number)}`);
      }}
    >
      {'cite [^ref]\n\n[^ref]: Ref https://hashbrown.dev'}
    </ProseRenderer>,
  );

  const citationLink = container.querySelector('sup a[role="doc-noteref"]');
  if (citationLink) {
    fireEvent.click(citationLink);
  }

  expect(clicked).toEqual(['ref:1']);
});

test('ProseRenderer renders unresolved citations without links', () => {
  const { container } = render(
    <ProseRenderer isComplete>{'cite [^missing]'}</ProseRenderer>,
  );

  const citationLink = container.querySelector('sup a[role="doc-noteref"]');
  const citationText = container.querySelector('sup')?.textContent;

  expect(citationLink).toBeNull();
  expect(citationText).toBe('1');
});

test('ProseRenderer override receives and can reuse default node', () => {
  const { container } = render(
    <ProseRenderer
      isComplete
      nodeRenderers={{
        strong: ({ defaultNode }) => (
          <span data-custom-node="strong-wrapper">{defaultNode}</span>
        ),
      }}
    >
      {'**bold**'}
    </ProseRenderer>,
  );

  const wrapper = container.querySelector(
    '[data-custom-node="strong-wrapper"]',
  );
  const defaultStrong = container.querySelector(
    'strong[data-prose-node="strong"]',
  );

  expect(wrapper).not.toBeNull();
  expect(defaultStrong?.textContent).toBe('bold');
});

test('ProseRenderer applies node fallback renderer when a type-specific renderer is missing', () => {
  const { container } = render(
    <ProseRenderer
      isComplete
      nodeRenderers={{
        node: ({ node, defaultNode }) => (
          <span data-fallback-node={node.type}>{defaultNode}</span>
        ),
      }}
    >
      {'hello'}
    </ProseRenderer>,
  );

  const fallbackTextWrapper = container.querySelector(
    'span[data-fallback-node="text"]',
  );

  expect(fallbackTextWrapper).not.toBeNull();
});

test('createProseNodeRenderers returns a typed renderer map', () => {
  const { container } = render(
    <ProseRenderer
      isComplete
      nodeRenderers={createProseNodeRenderers({
        paragraph: ({ children }) => (
          <section data-helper="paragraph">{children}</section>
        ),
      })}
    >
      {'hello'}
    </ProseRenderer>,
  );

  const section = container.querySelector('section[data-helper="paragraph"]');

  expect(section?.textContent).toContain('hello');
});

test('ProseRenderer uses the latest click callbacks after rerender', () => {
  const callsA: string[] = [];
  const callsB: string[] = [];
  const { container, rerender } = render(
    <ProseRenderer
      isComplete
      onLinkClick={(event, url) => {
        event.preventDefault();
        callsA.push(url);
      }}
      onCitationClick={(event, citation) => {
        event.preventDefault();
        callsA.push(citation.id);
      }}
    >
      {
        '[link](https://example.com)\n\ncite [^ref]\n\n[^ref]: Ref https://hashbrown.dev'
      }
    </ProseRenderer>,
  );

  rerender(
    <ProseRenderer
      isComplete
      onLinkClick={(event, url) => {
        event.preventDefault();
        callsB.push(url);
      }}
      onCitationClick={(event, citation) => {
        event.preventDefault();
        callsB.push(citation.id);
      }}
    >
      {
        '[link](https://example.com)\n\ncite [^ref]\n\n[^ref]: Ref https://hashbrown.dev'
      }
    </ProseRenderer>,
  );

  const link = container.querySelector('a[href="https://example.com"]');
  const citation = container.querySelector('sup a[role="doc-noteref"]');
  if (link) {
    fireEvent.click(link);
  }
  if (citation) {
    fireEvent.click(citation);
  }

  expect(callsA).toEqual([]);
  expect(callsB).toEqual(['https://example.com', 'ref']);
});

test('ProseRenderer invokes overrides for every node type in a rich document', () => {
  const seenTypes = new Set<string>();

  const nodeRenderers: ProseNodeRenderers = {
    document: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    paragraph: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    heading: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    blockquote: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    list: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    listItem: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    codeBlock: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    mathDisplay: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    htmlBlock: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    table: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    tableRow: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    tableCell: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    thematicBreak: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    text: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    emphasis: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    strong: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    strikethrough: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    inlineCode: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    mathInline: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    htmlInline: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    softBreak: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    hardBreak: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    image: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    link: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    linkReference: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    autolink: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    citationReference: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
  } as const;

  render(
    <ProseRenderer isComplete nodeRenderers={nodeRenderers}>
      {`# heading

> quote

- one
2. two

| c1 | c2 |
| --- | --- |
| v1 | v2 |

[link](https://example.com)
[reference][id]

[id]: https://example.com/reference
https://hashbrown.dev
![alt](https://images.example.com/p.png)
\`inline\` *em* **strong** ~~strike~~ $x$ <span>
soft
break  
hard

$$y$$

<div>block</div>

---

\`\`\`txt
code
\`\`\`

cite [^ref]

[^ref]: Ref https://hashbrown.dev`}
    </ProseRenderer>,
  );

  const allTypes = [
    'document',
    'paragraph',
    'heading',
    'blockquote',
    'list',
    'list-item',
    'code-block',
    'math-display',
    'html-block',
    'table',
    'table-row',
    'table-cell',
    'thematic-break',
    'text',
    'emphasis',
    'strong',
    'strikethrough',
    'inline-code',
    'math-inline',
    'html-inline',
    'soft-break',
    'hard-break',
    'image',
    'link',
    'link-reference',
    'autolink',
    'citation-reference',
  ];

  expect([...seenTypes].sort()).toEqual(allTypes.sort());
});
