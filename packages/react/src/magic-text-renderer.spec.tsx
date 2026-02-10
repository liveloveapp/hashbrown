import { fireEvent, render } from '@testing-library/react';
import {
  createMagicTextNodeRenderers,
  type MagicTextNodeRenderers,
  MagicTextRenderer,
} from './magic-text-renderer';

test('MagicTextRenderer renders markdown blocks and citations from the AST', () => {
  const { container } = render(
    <MagicTextRenderer
      isComplete
      options={{ segmenter: false }}
    >
      {'# Title\n\n- one\n- two\n\nCite [^ref]\n\n[^ref]: Ref https://hashbrown.dev'}
    </MagicTextRenderer>,
  );

  const heading = container.querySelector('h1');
  const listItems = container.querySelectorAll('li');
  const citation = container.querySelector('sup a[role="doc-noteref"]');

  expect(heading?.textContent).toBe('Title');
  expect(listItems).toHaveLength(2);
  expect(citation?.getAttribute('href')).toBe('https://hashbrown.dev');
  expect(citation?.textContent).toBe('[1]');
});

test('MagicTextRenderer creates one span per parsed text segment', () => {
  const { container } = render(
    <MagicTextRenderer options={{ segmenter: { granularity: 'grapheme' } }}>ab</MagicTextRenderer>,
  );

  const segments = container.querySelectorAll('span.hb-magic-text-segment');

  expect(segments).toHaveLength(2);
  expect(segments[0]?.textContent).toBe('a');
  expect(segments[1]?.textContent).toBe('b');
});

test('MagicTextRenderer prefixes word joiner before punctuation after citations', () => {
  const { container } = render(
    <MagicTextRenderer
      isComplete
      options={{ segmenter: { granularity: 'word' } }}
    >
      {'Alpha[^a]; beta\n\n[^a]: Source https://hashbrown.dev'}
    </MagicTextRenderer>,
  );

  const segments = Array.from(
    container.querySelectorAll('span.hb-magic-text-segment'),
  );
  const punctuationSegment = segments.find(
    (segment) => segment.textContent?.includes(';') ?? false,
  );

  expect(punctuationSegment?.textContent?.startsWith('\u2060;')).toBe(true);
});

test('MagicTextRenderer keeps unresolved citation punctuation glued', () => {
  const { container } = render(
    <MagicTextRenderer
      isComplete
      options={{ segmenter: { granularity: 'word' } }}
    >
      {'Alpha[^missing].'}
    </MagicTextRenderer>,
  );

  const unresolvedCitation = container.querySelector('sup[data-magic-text-node="citation"]');
  const unresolvedCitationButton = container.querySelector(
    'sup[data-magic-text-node="citation"] button',
  );
  const segments = Array.from(
    container.querySelectorAll('span.hb-magic-text-segment'),
  );
  const punctuationSegment = segments.find(
    (segment) => segment.textContent?.includes('.') ?? false,
  );

  expect(unresolvedCitation?.textContent).toBe('[1]');
  expect(unresolvedCitationButton).toBeNull();
  expect(punctuationSegment?.textContent?.startsWith('\u2060.')).toBe(true);
});

test('MagicTextRenderer preserves existing segment dom identity across updates', () => {
  const { container, rerender } = render(
    <MagicTextRenderer options={{ segmenter: { granularity: 'grapheme' } }}>ab</MagicTextRenderer>,
  );

  const initialSegments = container.querySelectorAll('span.hb-magic-text-segment');
  const firstSegmentBefore = initialSegments[0];

  rerender(
    <MagicTextRenderer options={{ segmenter: { granularity: 'grapheme' } }}>abc</MagicTextRenderer>,
  );

  const nextSegments = container.querySelectorAll('span.hb-magic-text-segment');
  const firstSegmentAfter = nextSegments[0];

  expect(nextSegments).toHaveLength(3);
  expect(firstSegmentAfter).toBe(firstSegmentBefore);
});

test('MagicTextRenderer keeps optimistic word-tail segment identity as it grows', () => {
  const { container, rerender } = render(
    <MagicTextRenderer options={{ segmenter: { granularity: 'word' } }}>hello wo</MagicTextRenderer>,
  );

  const firstSegments = container.querySelectorAll('span.hb-magic-text-segment');
  const tailBefore = firstSegments[2];

  rerender(
    <MagicTextRenderer options={{ segmenter: { granularity: 'word' } }}>hello world</MagicTextRenderer>,
  );

  const nextSegments = container.querySelectorAll('span.hb-magic-text-segment');
  const tailAfter = nextSegments[2];

  expect(nextSegments).toHaveLength(3);
  expect(tailAfter).toBe(tailBefore);
  expect(tailAfter?.textContent).toBe('world');
});

test('MagicTextRenderer renders a caret at the end of an open paragraph when enabled', () => {
  const { container } = render(
    <MagicTextRenderer caret options={{ segmenter: false }}>
      {'streaming paragraph'}
    </MagicTextRenderer>,
  );

  const paragraph = container.querySelector('p[data-magic-text-node="paragraph"]');
  const caret = container.querySelector('[data-magic-text-caret]');

  expect(paragraph?.textContent).toBe('streaming paragraph');
  expect(caret).not.toBeNull();
  expect(paragraph?.contains(caret)).toBe(true);
});

test('MagicTextRenderer hides the caret once parsing is complete', () => {
  const { container, rerender } = render(
    <MagicTextRenderer caret options={{ segmenter: false }}>
      {'streaming paragraph'}
    </MagicTextRenderer>,
  );

  rerender(
    <MagicTextRenderer caret isComplete options={{ segmenter: false }}>
      {'streaming paragraph'}
    </MagicTextRenderer>,
  );

  const caret = container.querySelector('[data-magic-text-caret]');

  expect(caret).toBeNull();
});

test('MagicTextRenderer does not render caret when only document root remains open', () => {
  const { container } = render(
    <MagicTextRenderer caret options={{ segmenter: false }}>
      {'Paragraph\n\n[^source'}
    </MagicTextRenderer>,
  );

  const paragraph = container.querySelector('p[data-magic-text-node="paragraph"]');
  const caret = container.querySelector('[data-magic-text-caret]');

  expect(paragraph?.textContent).toBe('Paragraph');
  expect(caret).toBeNull();
});

test('MagicTextRenderer allows overriding individual node renderers by node type', () => {
  const { container } = render(
    <MagicTextRenderer
      isComplete
      nodeRenderers={{
        paragraph: ({ children }) => (
          <section data-custom-node="paragraph">{children}</section>
        ),
        text: ({ node }) => (
          <mark data-custom-node="text">{node.text.toUpperCase()}</mark>
        ),
        citation: ({ citation }) => (
          <button type="button" data-custom-node="citation">
            {citation?.id}
          </button>
        ),
      }}
    >
      {'hello [^ref]\n\n[^ref]: Ref https://hashbrown.dev'}
    </MagicTextRenderer>,
  );

  const customParagraph = container.querySelector('section[data-custom-node="paragraph"]');
  const customText = container.querySelectorAll('mark[data-custom-node="text"]');
  const customCitation = container.querySelector('button[data-custom-node="citation"]');

  expect(customParagraph).not.toBeNull();
  expect(customText[0]?.textContent).toBe('HELLO ');
  expect(customCitation?.textContent).toBe('ref');
  expect(container.querySelector('p')).toBeNull();
});

test('MagicTextRenderer renders an empty root when there is no text', () => {
  const { container } = render(<MagicTextRenderer>{''}</MagicTextRenderer>);

  const root = container.querySelector('div[data-magic-text-root]');

  expect(root?.childElementCount).toBe(0);
});

test('MagicTextRenderer renders all heading levels', () => {
  const { container } = render(
    <MagicTextRenderer isComplete>
      {'# h1\n## h2\n### h3\n#### h4\n##### h5\n###### h6'}
    </MagicTextRenderer>,
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

test('MagicTextRenderer renders block and inline node families', () => {
  const { container } = render(
    <MagicTextRenderer isComplete>
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
    </MagicTextRenderer>,
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
  const inlineCode = container.querySelector('code[data-magic-text-node="inline-code"]');
  const emphasis = container.querySelector('em');
  const strong = container.querySelector('strong');
  const strike = container.querySelector('s');
  const hardBreak = container.querySelector('br[data-magic-text-node="hard-break"]');
  const thematicBreak = container.querySelector('hr[data-magic-text-node="thematic-break"]');
  const codeBlock = container.querySelector('pre code[data-code-info="ts"]');
  const segments = container.querySelectorAll('span.hb-magic-text-segment');

  expect(blockquote?.textContent).toBe('block');
  expect(unorderedList?.querySelectorAll('li')).toHaveLength(1);
  expect(orderedList?.getAttribute('start')).toBe('3');
  expect(orderedListItem?.textContent).toBe('three');
  expect(table).not.toBeNull();
  expect(tableHeaders).toHaveLength(2);
  expect(tableCells).toHaveLength(2);
  expect(markdownLink?.getAttribute('title')).toBe('title');
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

test('MagicTextRenderer calls link click callback for links and autolinks', () => {
  const linkUrls: string[] = [];
  const { container } = render(
    <MagicTextRenderer
      isComplete
      onLinkClick={(event, url) => {
        event.preventDefault();
        linkUrls.push(url);
      }}
    >
      {'[link](https://example.com)\n\nhttps://hashbrown.dev'}
    </MagicTextRenderer>,
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

test('MagicTextRenderer calls citation callback when a citation has a URL', () => {
  const clicked: string[] = [];
  const { container } = render(
    <MagicTextRenderer
      isComplete
      onCitationClick={(event, citation) => {
        event.preventDefault();
        clicked.push(`${citation.id}:${String(citation.number)}`);
      }}
    >
      {'cite [^ref]\n\n[^ref]: Ref https://hashbrown.dev'}
    </MagicTextRenderer>,
  );

  const citationLink = container.querySelector('sup a[role="doc-noteref"]');
  if (citationLink) {
    fireEvent.click(citationLink);
  }

  expect(clicked).toEqual(['ref:1']);
});

test('MagicTextRenderer renders unresolved citations without links', () => {
  const { container } = render(
    <MagicTextRenderer isComplete>{'cite [^missing]'}</MagicTextRenderer>,
  );

  const citationLink = container.querySelector('sup a[role="doc-noteref"]');
  const citationText = container.querySelector('sup')?.textContent;

  expect(citationLink).toBeNull();
  expect(citationText).toBe('[1]');
});

test('MagicTextRenderer override receives and can reuse default node', () => {
  const { container } = render(
    <MagicTextRenderer
      isComplete
      nodeRenderers={{
        strong: ({ defaultNode }) => (
          <span data-custom-node="strong-wrapper">{defaultNode}</span>
        ),
      }}
    >
      {'**bold**'}
    </MagicTextRenderer>,
  );

  const wrapper = container.querySelector('[data-custom-node="strong-wrapper"]');
  const defaultStrong = container.querySelector('strong[data-magic-text-node="strong"]');

  expect(wrapper).not.toBeNull();
  expect(defaultStrong?.textContent).toBe('bold');
});

test('MagicTextRenderer applies node fallback renderer when a type-specific renderer is missing', () => {
  const { container } = render(
    <MagicTextRenderer
      isComplete
      nodeRenderers={{
        node: ({ node, defaultNode }) => (
          <span data-fallback-node={node.type}>{defaultNode}</span>
        ),
      }}
    >
      {'hello'}
    </MagicTextRenderer>,
  );

  const fallbackTextWrapper = container.querySelector('span[data-fallback-node="text"]');

  expect(fallbackTextWrapper).not.toBeNull();
});

test('createMagicTextNodeRenderers returns a typed renderer map', () => {
  const { container } = render(
    <MagicTextRenderer
      isComplete
      nodeRenderers={createMagicTextNodeRenderers({
        paragraph: ({ children }) => <section data-helper="paragraph">{children}</section>,
      })}
    >
      {'hello'}
    </MagicTextRenderer>,
  );

  const section = container.querySelector('section[data-helper="paragraph"]');

  expect(section?.textContent).toContain('hello');
});

test('MagicTextRenderer uses the latest click callbacks after rerender', () => {
  const callsA: string[] = [];
  const callsB: string[] = [];
  const { container, rerender } = render(
    <MagicTextRenderer
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
      {'[link](https://example.com)\n\ncite [^ref]\n\n[^ref]: Ref https://hashbrown.dev'}
    </MagicTextRenderer>,
  );

  rerender(
    <MagicTextRenderer
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
      {'[link](https://example.com)\n\ncite [^ref]\n\n[^ref]: Ref https://hashbrown.dev'}
    </MagicTextRenderer>,
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

test('MagicTextRenderer invokes overrides for every node type in a rich document', () => {
  const seenTypes = new Set<string>();

  const nodeRenderers: MagicTextNodeRenderers = {
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
    em: ({ node, defaultNode }) => {
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
    autolink: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
    citation: ({ node, defaultNode }) => {
      seenTypes.add(node.type);
      return defaultNode;
    },
  } as const;

  render(
    <MagicTextRenderer isComplete nodeRenderers={nodeRenderers}>
      {`# heading

> quote

- one
2. two

| c1 | c2 |
| --- | --- |
| v1 | v2 |

[link](https://example.com)
https://hashbrown.dev
![alt](https://images.example.com/p.png)
\`inline\` *em* **strong** ~~strike~~
soft
break  
hard

---

\`\`\`txt
code
\`\`\`

cite [^ref]

[^ref]: Ref https://hashbrown.dev`}
    </MagicTextRenderer>,
  );

  const allTypes = [
    'document',
    'paragraph',
    'heading',
    'blockquote',
    'list',
    'list-item',
    'code-block',
    'table',
    'table-row',
    'table-cell',
    'thematic-break',
    'text',
    'em',
    'strong',
    'strikethrough',
    'inline-code',
    'soft-break',
    'hard-break',
    'image',
    'link',
    'autolink',
    'citation',
  ];

  expect([...seenTypes].sort()).toEqual(allTypes.sort());
});
