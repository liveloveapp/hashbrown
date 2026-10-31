import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fireEvent } from '@testing-library/dom';
import {
  Prose,
  ProseCitationClickEvent,
  ProseLinkClickEvent,
  ProseRenderCaret,
  ProseRenderCitation,
  ProseRenderNode,
  ProseRenderTextSegment,
} from './prose-renderer.component';

function renderProse(input: {
  text: string;
  isComplete?: boolean;
  segmenter?: false | true | { granularity?: 'grapheme' | 'word' | 'sentence' };
  caret?: boolean;
}) {
  TestBed.configureTestingModule({
    imports: [Prose],
  });

  const fixture = TestBed.createComponent(Prose);
  fixture.componentRef.setInput('text', input.text);
  if (input.isComplete !== undefined) {
    fixture.componentRef.setInput('isComplete', input.isComplete);
  }
  if (input.segmenter !== undefined) {
    fixture.componentRef.setInput('segmenter', input.segmenter);
  }
  if (input.caret !== undefined) {
    fixture.componentRef.setInput('caret', input.caret);
  }

  fixture.detectChanges();

  return fixture;
}

test('renders markdown blocks and citations from the AST', () => {
  const fixture = renderProse({
    text: '# Title\n\n- one\n- two\n\nCite [^ref]\n\n[^ref]: Ref https://hashbrown.dev',
    isComplete: true,
    segmenter: false,
  });

  const host = fixture.nativeElement as HTMLElement;
  const heading = host.querySelector('h1');
  const listItems = host.querySelectorAll('li');
  const citation = host.querySelector('sup a[role="doc-noteref"]');

  expect(heading?.textContent).toBe('Title');
  expect(listItems).toHaveLength(2);
  expect(citation?.getAttribute('href')).toBe('https://hashbrown.dev');
  expect(citation?.getAttribute('target')).toBe('_blank');
  expect(citation?.getAttribute('rel')).toBe('noopener noreferrer');
  expect(citation?.textContent).toBe('1');
});

test('creates one span per parsed text segment', () => {
  const fixture = renderProse({
    text: 'ab',
    segmenter: { granularity: 'grapheme' },
  });

  const segments = (fixture.nativeElement as HTMLElement).querySelectorAll(
    'span.hb-prose-segment',
  );

  expect(segments).toHaveLength(2);
  expect(segments[0]?.textContent).toBe('a');
  expect(segments[1]?.textContent).toBe('b');
});

test('prefixes word joiner before punctuation after citations', () => {
  const fixture = renderProse({
    text: 'Alpha[^a]; beta\n\n[^a]: Source https://hashbrown.dev',
    isComplete: true,
    segmenter: { granularity: 'word' },
  });
  const segments = Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll(
      'span.hb-prose-segment',
    ),
  );
  const punctuationSegment = segments.find((segment) =>
    segment.textContent?.includes(';'),
  );

  expect(punctuationSegment?.textContent?.startsWith('\u2060;')).toBe(true);
});

test('preserves existing segment DOM identity across updates', () => {
  const fixture = renderProse({
    text: 'ab',
    segmenter: { granularity: 'grapheme' },
  });

  const host = fixture.nativeElement as HTMLElement;
  const before = host.querySelectorAll('span.hb-prose-segment')[0];

  fixture.componentRef.setInput('text', 'abc');
  fixture.detectChanges();

  const afterSegments = host.querySelectorAll('span.hb-prose-segment');
  const after = afterSegments[0];

  expect(afterSegments).toHaveLength(3);
  expect(after).toBe(before);
});

test('renders structural nodes added by prefix updates', () => {
  const fixture = renderProse({
    text: 'first',
    segmenter: false,
  });

  const host = fixture.nativeElement as HTMLElement;

  fixture.componentRef.setInput('text', 'first\n\nsecond');
  fixture.detectChanges();

  const paragraphs = host.querySelectorAll(
    'p[data-prose-node="paragraph"]',
  );

  expect(paragraphs).toHaveLength(2);
  expect(paragraphs[0]?.textContent).toBe('first');
  expect(paragraphs[1]?.textContent).toBe('second');
});

test('keeps optimistic word-tail segment identity as it grows', () => {
  const fixture = renderProse({
    text: 'hello wo',
    segmenter: { granularity: 'word' },
  });

  const host = fixture.nativeElement as HTMLElement;
  const beforeSegments = host.querySelectorAll('span.hb-prose-segment');
  const tailBefore = beforeSegments[2];

  fixture.componentRef.setInput('text', 'hello world');
  fixture.detectChanges();

  const afterSegments = host.querySelectorAll('span.hb-prose-segment');
  const tailAfter = afterSegments[2];

  expect(afterSegments).toHaveLength(3);
  expect(tailAfter).toBe(tailBefore);
  expect(tailAfter?.textContent).toBe('world');
});

test('renders a caret while incomplete and hides it when complete', () => {
  const fixture = renderProse({
    text: 'streaming paragraph',
    segmenter: false,
    caret: true,
  });

  const host = fixture.nativeElement as HTMLElement;
  const openCaret = host.querySelector('[data-prose-caret]');

  expect(openCaret).not.toBeNull();

  fixture.componentRef.setInput('isComplete', true);
  fixture.detectChanges();

  const closedCaret = host.querySelector('[data-prose-caret]');

  expect(closedCaret).toBeNull();
});

test('does not render caret when only document root remains open', () => {
  const fixture = renderProse({
    text: 'Paragraph\n\n',
    segmenter: false,
    caret: true,
  });

  const host = fixture.nativeElement as HTMLElement;
  const paragraph = host.querySelector('p[data-prose-node="paragraph"]');
  const caret = host.querySelector('[data-prose-caret]');

  expect(paragraph?.textContent).toBe('Paragraph');
  expect(caret).toBeNull();
});

test('does not render caret when caret input is false', () => {
  const fixture = renderProse({
    text: 'streaming paragraph',
    segmenter: false,
    caret: false,
  });

  const caret = (fixture.nativeElement as HTMLElement).querySelector(
    '[data-prose-caret]',
  );

  expect(caret).toBeNull();
});

test('renders the caret inside streaming leaf nodes', () => {
  const cases = [
    ['`code', 'inline-code'],
    ['$$x', 'math-display'],
    ['<div>\ncontent', 'html-block'],
    ['https://example.com', 'autolink'],
  ] as const;

  TestBed.configureTestingModule({ imports: [Prose] });

  for (const [text, nodeType] of cases) {
    const fixture = TestBed.createComponent(Prose);
    fixture.componentRef.setInput('text', text);
    fixture.componentRef.setInput('segmenter', false);
    fixture.componentRef.setInput('caret', true);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const node = host.querySelector(`[data-prose-node="${nodeType}"]`);
    const caret = host.querySelector('[data-prose-caret]');

    expect(node).not.toBeNull();
    expect(caret).not.toBeNull();
    expect(node?.contains(caret)).toBe(true);
  }
});

test('table header detection handles both header and non-header parents', () => {
  const fixture = renderProse({
    text: '| a | b |\n| - | - |\n| c | d |',
    isComplete: true,
    segmenter: false,
  });
  const component = fixture.componentInstance as unknown as {
    getNodeById: (nodeId: number) => unknown;
    isTableHeaderCell: (node: { parent: unknown }) => boolean;
  };
  const originalGetNodeById = component.getNodeById;

  component.getNodeById = () => ({ type: 'table-row', isHeader: true });
  const headerCell = component.isTableHeaderCell({
    parent: { type: 'table-row', isHeader: true },
  });

  component.getNodeById = () => ({ type: 'table-row', isHeader: false });
  const bodyCell = component.isTableHeaderCell({
    parent: { type: 'table-row', isHeader: false },
  });

  component.getNodeById = originalGetNodeById;

  expect(headerCell).toBe(true);
  expect(bodyCell).toBe(false);
});

test('renders unresolved citations as plain superscript references', () => {
  const fixture = renderProse({
    text: 'Cite [^missing]',
    isComplete: true,
    segmenter: false,
  });

  const unresolvedCitation = (
    fixture.nativeElement as HTMLElement
  ).querySelector('sup .hb-prose-citation-label[role="doc-noteref"]');

  expect(unresolvedCitation?.textContent).toBe('1');
});

test('renders Cacheplane task, reference, math, and HTML nodes', () => {
  const fixture = renderProse({
    text: `- [x] done

[reference][id]

[id]: https://example.com "title"

$x$

$$y$$

<span data-injected-html>safe</span>

<div>block</div>`,
    isComplete: true,
    segmenter: false,
  });
  const host = fixture.nativeElement as HTMLElement;
  const task = host.querySelector(
    'li input[type="checkbox"]',
  ) as HTMLInputElement | null;
  const reference = host.querySelector(
    'a[data-prose-node="link-reference"]',
  );
  const inlineMath = host.querySelector('[data-prose-node="math-inline"]');
  const displayMath = host.querySelector(
    '[data-prose-node="math-display"]',
  );
  const inlineHtml = host.querySelector('[data-prose-node="html-inline"]');
  const blockHtml = host.querySelector('[data-prose-node="html-block"]');

  expect(task?.checked).toBe(true);
  expect(task?.disabled).toBe(true);
  expect(reference?.getAttribute('href')).toBe('https://example.com');
  expect(reference?.getAttribute('title')).toBe('title');
  expect(inlineMath?.textContent).toBe('$x$');
  expect(displayMath?.textContent).toBe('$$y$$');
  expect(inlineHtml?.textContent).toBe('<span data-injected-html>');
  expect(blockHtml?.textContent).toBe('<div>block</div>');
  expect(host.querySelector('[data-injected-html]')).toBeNull();
});

test('removes unsafe link, citation, and image URLs', () => {
  const fixture = renderProse({
    text: `[link](javascript:alert)

![image](data:text/html,unsafe)

Cite [^bad]

[^bad]: [Source](vbscript:unsafe)`,
    isComplete: true,
    segmenter: false,
  });
  const host = fixture.nativeElement as HTMLElement;
  const link = host.querySelector('[data-prose-node="link"]');
  const image = host.querySelector('[data-prose-node="image"]');
  const citation = host.querySelector('sup a[role="doc-noteref"]');

  expect(link?.getAttribute('href')).toBeNull();
  // Angular 22.2 normalizes an unset image src to an empty attribute.
  expect([null, '']).toContain(image?.getAttribute('src'));
  expect(citation).toBeNull();
});

test('renders Cacheplane table-cell alignment', () => {
  const fixture = renderProse({
    text: '| left | center | right |\n| :--- | :---: | ---: |\n| a | b | c |',
    isComplete: true,
    segmenter: false,
  });
  const cells = (fixture.nativeElement as HTMLElement).querySelectorAll('td');

  expect((cells[0] as HTMLElement | undefined)?.style.textAlign).toBe('left');
  expect((cells[1] as HTMLElement | undefined)?.style.textAlign).toBe('center');
  expect((cells[2] as HTMLElement | undefined)?.style.textAlign).toBe('right');
});

@Component({
  selector: 'hb-paragraph-override-host',
  standalone: true,
  imports: [Prose, ProseRenderNode],
  template: `
    <hb-prose [text]="text()" [isComplete]="true" [segmenter]="false">
      <ng-template hbProseRenderNode nodeType="paragraph" let-node="node">
        <section
          data-custom-node="paragraph"
          [attr.data-open]="node.status !== 'complete'"
        >
          custom paragraph
        </section>
      </ng-template>
    </hb-prose>
  `,
})
class ParagraphOverrideHostComponent {
  text = signal('hello');
}

test('uses type-specific node override templates', () => {
  const fixture = TestBed.configureTestingModule({
    imports: [ParagraphOverrideHostComponent],
  }).createComponent(ParagraphOverrideHostComponent);

  fixture.detectChanges();

  const paragraph = (fixture.nativeElement as HTMLElement).querySelector(
    'section[data-custom-node="paragraph"]',
  );
  const defaultParagraph = (fixture.nativeElement as HTMLElement).querySelector(
    'p',
  );

  expect(paragraph).not.toBeNull();
  expect(defaultParagraph).toBeNull();
});

@Component({
  selector: 'hb-fallback-override-host',
  standalone: true,
  imports: [Prose, ProseRenderNode],
  template: `
    <hb-prose [text]="text()" [isComplete]="true" [segmenter]="false">
      <ng-template hbProseRenderNode nodeType="node" let-node="node">
        <span [attr.data-fallback-node]="node.type"></span>
      </ng-template>
    </hb-prose>
  `,
})
class FallbackOverrideHostComponent {
  text = signal('hello');
}

test('uses fallback node template when no type-specific template exists', () => {
  const fixture = TestBed.configureTestingModule({
    imports: [FallbackOverrideHostComponent],
  }).createComponent(FallbackOverrideHostComponent);

  fixture.detectChanges();

  const fallback = (fixture.nativeElement as HTMLElement).querySelector(
    'span[data-fallback-node="document"]',
  );

  expect(fallback).not.toBeNull();
});

@Component({
  selector: 'hb-text-segment-override-host',
  standalone: true,
  imports: [Prose, ProseRenderTextSegment],
  template: `
    <hb-prose
      [text]="text()"
      [isComplete]="true"
      [segmenter]="{ granularity: 'grapheme' }"
    >
      <ng-template hbProseRenderTextSegment let-segment="segment">
        <mark data-custom-segment>{{ segment.text }}</mark>
      </ng-template>
    </hb-prose>
  `,
})
class TextSegmentOverrideHostComponent {
  text = signal('ab');
}

test('uses text segment override templates', () => {
  const fixture = TestBed.configureTestingModule({
    imports: [TextSegmentOverrideHostComponent],
  }).createComponent(TextSegmentOverrideHostComponent);

  fixture.detectChanges();

  const segments = (fixture.nativeElement as HTMLElement).querySelectorAll(
    'mark[data-custom-segment]',
  );

  expect(segments).toHaveLength(2);
  expect(segments[0]?.textContent).toBe('a');
  expect(segments[1]?.textContent).toBe('b');
});

@Component({
  selector: 'hb-citation-override-host',
  standalone: true,
  imports: [Prose, ProseRenderCitation],
  template: `
    <hb-prose [text]="text()" [isComplete]="true" [segmenter]="false">
      <ng-template
        hbProseRenderCitation
        let-citation="citation"
        let-label="label"
      >
        <a
          data-custom-citation
          [attr.href]="citation.url ?? null"
          [attr.data-id]="citation.id"
          [attr.data-label]="label"
          >custom citation</a
        >
      </ng-template>
    </hb-prose>
  `,
})
class CitationOverrideHostComponent {
  text = signal('Cite [^ref]\n\n[^ref]: Ref https://hashbrown.dev');
}

test('uses citation override template with resolved citation context', () => {
  const fixture = TestBed.configureTestingModule({
    imports: [CitationOverrideHostComponent],
  }).createComponent(CitationOverrideHostComponent);

  fixture.detectChanges();

  const citation = (fixture.nativeElement as HTMLElement).querySelector(
    '[data-custom-citation]',
  );

  expect(citation?.getAttribute('href')).toBe('https://hashbrown.dev');
  expect(citation?.getAttribute('data-id')).toBe('ref');
  expect(citation?.getAttribute('data-label')).toBe('1');
});

@Component({
  selector: 'hb-caret-override-host',
  standalone: true,
  imports: [Prose, ProseRenderCaret],
  template: `
    <hb-prose [text]="text()" [segmenter]="false" [caret]="true">
      <ng-template hbProseRenderCaret let-node="node">
        <span data-custom-caret [attr.data-open-node]="node.id">|</span>
      </ng-template>
    </hb-prose>
  `,
})
class CaretOverrideHostComponent {
  text = signal('streaming');
}

test('uses custom caret template while incomplete', () => {
  const fixture = TestBed.configureTestingModule({
    imports: [CaretOverrideHostComponent],
  }).createComponent(CaretOverrideHostComponent);

  fixture.detectChanges();

  const caret = (fixture.nativeElement as HTMLElement).querySelector(
    'span[data-custom-caret]',
  );
  const defaultCaret = (fixture.nativeElement as HTMLElement).querySelector(
    '[data-prose-caret]',
  );

  expect(caret).not.toBeNull();
  expect(defaultCaret).toBeNull();
});

@Component({
  selector: 'hb-caret-input-template-host',
  standalone: true,
  imports: [Prose],
  template: `
    <ng-template #inputCaret let-node="node">
      <span data-input-caret [attr.data-node-id]="node.id">*</span>
    </ng-template>
    <hb-prose [text]="text()" [segmenter]="false" [caret]="inputCaret" />
  `,
})
class CaretInputTemplateHostComponent {
  text = signal('streaming');
}

test('uses caret template passed via caret input', () => {
  const fixture = TestBed.configureTestingModule({
    imports: [CaretInputTemplateHostComponent],
  }).createComponent(CaretInputTemplateHostComponent);

  fixture.detectChanges();

  const host = fixture.nativeElement as HTMLElement;
  const inputCaret = host.querySelector('[data-input-caret]');
  const defaultCaret = host.querySelector('[data-prose-caret]');

  expect(inputCaret).not.toBeNull();
  expect(defaultCaret).toBeNull();
});

test('emits linkClick and citationClick events', () => {
  const fixture = renderProse({
    text: '[link](https://example.com) [^ref]\n\n[^ref]: Ref https://hashbrown.dev',
    isComplete: true,
    segmenter: false,
  });

  const linkEvents: ProseLinkClickEvent[] = [];
  const citationEvents: ProseCitationClickEvent[] = [];

  fixture.componentInstance.linkClick.subscribe((event) => {
    event.mouseEvent.preventDefault();
    linkEvents.push(event);
  });
  fixture.componentInstance.citationClick.subscribe((event) =>
    citationEvents.push(event),
  );

  const host = fixture.nativeElement as HTMLElement;
  const link = host.querySelector(
    'a[href="https://example.com"]',
  ) as HTMLAnchorElement | null;
  const citation = host.querySelector(
    'sup a[role="doc-noteref"]',
  ) as HTMLAnchorElement | null;

  if (link) {
    fireEvent.click(link);
  }

  if (citation) {
    fireEvent.click(citation);
  }

  expect(link?.getAttribute('target')).toBe('_blank');
  expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  expect(citation?.getAttribute('target')).toBe('_blank');
  expect(citation?.getAttribute('rel')).toBe('noopener noreferrer');
  expect(linkEvents.map((event) => event.url)).toEqual(['https://example.com']);
  expect(citationEvents.map((event) => event.citation.id)).toEqual(['ref']);
});

test('Prose helper APIs return expected render contexts', () => {
  const fixture = renderProse({
    text: 'hello',
    isComplete: true,
    segmenter: false,
  });

  const component = fixture.componentInstance as unknown as {
    rootNode: () => { children: Array<{ type: string }> } | null;
    getNodeRenderContext: (node: unknown) => { renderChildren: () => unknown };
    isTableHeaderCell: (node: unknown) => boolean;
  };
  const paragraph = component
    .rootNode()
    ?.children.find((node) => node.type === 'paragraph');

  if (!paragraph) {
    throw new Error('Expected paragraph node');
  }

  const context = component.getNodeRenderContext(paragraph);
  const renderedChildren = context.renderChildren();
  const isHeaderWithoutParent = component.isTableHeaderCell({
    type: 'table-cell',
    parent: null,
  });

  expect(Array.isArray(renderedChildren)).toBe(true);
  expect(isHeaderWithoutParent).toBe(false);
});

test('Prose directive context guards always return true', () => {
  expect(
    ProseRenderNode.ngTemplateContextGuard(
      null as unknown as ProseRenderNode,
      {},
    ),
  ).toBe(true);
  expect(
    ProseRenderTextSegment.ngTemplateContextGuard(
      null as unknown as ProseRenderTextSegment,
      {},
    ),
  ).toBe(true);
  expect(
    ProseRenderCaret.ngTemplateContextGuard(
      null as unknown as ProseRenderCaret,
      {},
    ),
  ).toBe(true);
  expect(
    ProseRenderCitation.ngTemplateContextGuard(
      null as unknown as ProseRenderCitation,
      {},
    ),
  ).toBe(true);
});
