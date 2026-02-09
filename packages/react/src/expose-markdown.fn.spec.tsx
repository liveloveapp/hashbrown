import { render } from '@testing-library/react';
import type { ComponentNode } from '@hashbrownai/core';
import { exposeMarkdown } from './expose-markdown.fn';
import { renderUiNodes } from './hooks/ui-kit.helpers';

function renderMarkdownNode(
  node: ComponentNode,
  component = exposeMarkdown({ options: { segmenter: false } }),
) {
  const registry = new Map([[component.name, component]]);
  const rendered = renderUiNodes([node], registry);

  return render(<div>{rendered}</div>);
}

test('exposeMarkdown uses defaults and exposes only children to the LLM', () => {
  const component = exposeMarkdown();

  expect(component.name).toBe('Markdown');
  expect(component.description).toContain('Write all markdown into the `children` prop.');
  expect(component.description).not.toContain('For citations, use inline references');
  expect(Object.keys(component.props ?? {})).toEqual(['children']);
});

test('exposeMarkdown appends citation guidance when citations is true', () => {
  const component = exposeMarkdown({ citations: true });

  expect(component.description).toContain('For citations, use inline references');
  expect(component.description).toContain('Citation numbers are assigned by first inline reference');
});

test('exposeMarkdown uses custom description verbatim', () => {
  const component = exposeMarkdown({
    citations: true,
    description: 'Custom markdown description.',
  });

  expect(component.description).toBe('Custom markdown description.');
});

test('exposeMarkdown maps node value and completion state to MagicTextRenderer', () => {
  const { container } = renderMarkdownNode({
    Markdown: {
      props: {
        complete: false,
        partialValue: {
          children: {
            complete: false,
            partialValue: 'streaming paragraph',
            value: 'streaming paragraph',
          },
        },
        value: {
          children: {
            complete: false,
            partialValue: 'streaming paragraph',
            value: 'streaming paragraph',
          },
        },
      },
    },
  });

  const paragraph = container.querySelector('p[data-magic-text-node="paragraph"]');
  const caret = container.querySelector('[data-magic-text-caret]');

  expect(paragraph?.textContent).toBe('streaming paragraph');
  expect(paragraph?.getAttribute('data-node-open')).toBe('true');
  expect(caret).not.toBeNull();
});

test('exposeMarkdown uses partial markdown text when node value is absent', () => {
  const { container } = renderMarkdownNode({
    Markdown: {
      props: {
        complete: false,
        partialValue: {
          children: {
            complete: false,
            partialValue: 'partial markdown',
          },
        },
        value: {
          children: {
            complete: false,
            partialValue: 'partial markdown',
          },
        },
      },
    },
  });

  const paragraph = container.querySelector('p[data-magic-text-node="paragraph"]');

  expect(paragraph?.textContent).toBe('partial markdown');
  expect(paragraph?.getAttribute('data-node-open')).toBe('true');
});

test('exposeMarkdown finalizes rendering when children node is complete', () => {
  const { container } = renderMarkdownNode({
    Markdown: {
      props: {
        complete: true,
        partialValue: {
          children: {
            complete: true,
            partialValue: 'done',
            value: 'done',
          },
        },
        value: {
          children: {
            complete: true,
            partialValue: 'done',
            value: 'done',
          },
        },
      },
    },
  });

  const paragraph = container.querySelector('p[data-magic-text-node="paragraph"]');

  expect(paragraph?.getAttribute('data-node-open')).toBe('false');
});

test('exposeMarkdown allows disabling the default caret', () => {
  const { container } = renderMarkdownNode(
    {
      Markdown: {
        props: {
          complete: false,
          partialValue: {
            children: {
              complete: false,
              partialValue: 'streaming paragraph',
              value: 'streaming paragraph',
            },
          },
          value: {
            children: {
              complete: false,
              partialValue: 'streaming paragraph',
              value: 'streaming paragraph',
            },
          },
        },
      },
    },
    exposeMarkdown({ options: { segmenter: false }, caret: false }),
  );

  const caret = container.querySelector('[data-magic-text-caret]');

  expect(caret).toBeNull();
});
