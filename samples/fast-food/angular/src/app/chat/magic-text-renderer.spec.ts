import {
  create,
  finish,
  push,
  resolve,
  type MarkdownDocumentNode,
  type MarkdownNode,
} from '@cacheplane/partial-markdown';

function parseMagicText(input: string): MarkdownDocumentNode {
  const parsed = push(create(), input);
  const root = resolve(finish(parsed));
  if (!root) {
    throw new Error('Expected parsed Markdown root');
  }

  return root;
}

function renderNode(node: MarkdownNode | undefined): string {
  if (!node) {
    return '';
  }

  switch (node.type) {
    case 'document':
    case 'paragraph':
    case 'heading':
    case 'blockquote':
    case 'list':
    case 'list-item':
    case 'table':
    case 'table-row':
    case 'table-cell':
    case 'emphasis':
    case 'strong':
    case 'strikethrough':
    case 'link':
    case 'link-reference':
      return node.children.map((child) => renderNode(child)).join('');
    case 'text':
      return node.text;
    case 'inline-code':
      return node.text;
    case 'citation-reference':
      return `[${node.index}]`;
    case 'autolink':
      return node.text;
    case 'soft-break':
      return ' ';
    case 'hard-break':
      return '\n';
    case 'image':
      return node.alt;
    case 'code-block':
    case 'math-display':
      return node.text;
    case 'math-inline':
      return node.text;
    case 'html-block':
    case 'html-inline':
      return node.raw;
    case 'thematic-break':
      return '';
  }
}

function renderMagicText(input: string): string {
  const rootNode = parseMagicText(input);

  return renderNode(rootNode);
}

test('keeps the space before inline links intact', () => {
  const rendered = renderMagicText(
    'Visit [Subway wraps](/wraps), high protein.',
  );

  expect(rendered).toBe('Visit Subway wraps, high protein.');
});

test('keeps punctuation tight after linked text', () => {
  const rendered = renderMagicText('Tight [link](/foo)!');

  expect(rendered).toBe('Tight link!');
});

test('preserves spacing around citations following links', () => {
  const rendered = renderMagicText('Numbers [link](/foo)[^1] still tight.');

  expect(rendered).toBe('Numbers link[1] still tight.');
});

test('normalizes whitespace in the Taco Bell summary sentence', () => {
  const rendered = renderMagicText(
    'Among the current Taco Bell favorites, the [Cinnabon Delights 12 Pack](/items/cinnabon-delights) reaches 930 calories, 53 g fat, and 59 g sugar, yet only 9 g protein. [^1]',
  );

  expect(rendered).toBe(
    'Among the current Taco Bell favorites, the Cinnabon Delights 12 Pack reaches 930 calories, 53 g fat, and 59 g sugar, yet only 9 g protein. [1]',
  );
});

test('keeps a space before citations after italic text', () => {
  const rendered = renderMagicText('Finish with *italic* note [^2].');

  expect(rendered).toBe('Finish with italic note [1].');
});

test('keeps a space before citations after bold text', () => {
  const rendered = renderMagicText('Finish with **bold** statement [^3].');

  expect(rendered).toBe('Finish with bold statement [1].');
});

test('keeps a space before citations after linked text', () => {
  const rendered = renderMagicText('Link first [anchor](/a) then cite [^4].');

  expect(rendered).toBe('Link first anchor then cite [1].');
});
