import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fireEvent } from '@testing-library/dom';
import {
  MagicText,
  MagicTextCitationClickEvent,
  MagicTextLinkClickEvent,
  MagicTextRenderCaret,
  MagicTextRenderNode,
  MagicTextRenderTextSegment,
} from './magic-text-renderer.component';

function renderMagicText(input: {
  text: string;
  isComplete?: boolean;
  options?: {
    segmenter?:
      | false
      | true
      | { granularity?: 'grapheme' | 'word' | 'sentence' };
  };
  caret?: boolean;
}) {
  TestBed.configureTestingModule({
    imports: [MagicText],
  });

  const fixture = TestBed.createComponent(MagicText);
  fixture.componentRef.setInput('text', input.text);
  if (input.isComplete !== undefined) {
    fixture.componentRef.setInput('isComplete', input.isComplete);
  }
  if (input.options !== undefined) {
    fixture.componentRef.setInput('options', input.options);
  }
  if (input.caret !== undefined) {
    fixture.componentRef.setInput('caret', input.caret);
  }

  fixture.detectChanges();

  return fixture;
}

test('renders markdown blocks and citations from the AST', () => {
  const fixture = renderMagicText({
    text: '# Title\n\n- one\n- two\n\nCite [^ref]\n\n[^ref]: Ref https://hashbrown.dev',
    isComplete: true,
    options: { segmenter: false },
  });

  const host = fixture.nativeElement as HTMLElement;
  const heading = host.querySelector('h1');
  const listItems = host.querySelectorAll('li');
  const citation = host.querySelector('sup a[role="doc-noteref"]');

  expect(heading?.textContent).toBe('Title');
  expect(listItems).toHaveLength(2);
  expect(citation?.getAttribute('href')).toBe('https://hashbrown.dev');
  expect(citation?.textContent).toBe('[1]');
});

test('creates one span per parsed text segment', () => {
  const fixture = renderMagicText({
    text: 'ab',
    options: { segmenter: { granularity: 'grapheme' } },
  });

  const segments = (fixture.nativeElement as HTMLElement).querySelectorAll(
    'span.hb-magic-text-segment',
  );

  expect(segments).toHaveLength(2);
  expect(segments[0]?.textContent).toBe('a');
  expect(segments[1]?.textContent).toBe('b');
});

test('prefixes word joiner before punctuation after citations', () => {
  const fixture = renderMagicText({
    text: 'Alpha[^a]; beta\n\n[^a]: Source https://hashbrown.dev',
    isComplete: true,
    options: { segmenter: { granularity: 'word' } },
  });
  const segments = Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll(
      'span.hb-magic-text-segment',
    ),
  );
  const punctuationSegment = segments.find((segment) =>
    segment.textContent?.includes(';'),
  );

  expect(punctuationSegment?.textContent?.startsWith('\u2060;')).toBe(true);
});

test('preserves existing segment DOM identity across updates', () => {
  const fixture = renderMagicText({
    text: 'ab',
    options: { segmenter: { granularity: 'grapheme' } },
  });

  const host = fixture.nativeElement as HTMLElement;
  const before = host.querySelectorAll('span.hb-magic-text-segment')[0];

  fixture.componentRef.setInput('text', 'abc');
  fixture.detectChanges();

  const afterSegments = host.querySelectorAll('span.hb-magic-text-segment');
  const after = afterSegments[0];

  expect(afterSegments).toHaveLength(3);
  expect(after).toBe(before);
});

test('keeps optimistic word-tail segment identity as it grows', () => {
  const fixture = renderMagicText({
    text: 'hello wo',
    options: { segmenter: { granularity: 'word' } },
  });

  const host = fixture.nativeElement as HTMLElement;
  const beforeSegments = host.querySelectorAll('span.hb-magic-text-segment');
  const tailBefore = beforeSegments[2];

  fixture.componentRef.setInput('text', 'hello world');
  fixture.detectChanges();

  const afterSegments = host.querySelectorAll('span.hb-magic-text-segment');
  const tailAfter = afterSegments[2];

  expect(afterSegments).toHaveLength(3);
  expect(tailAfter).toBe(tailBefore);
  expect(tailAfter?.textContent).toBe('world');
});

test('renders a caret while incomplete and hides it when complete', () => {
  const fixture = renderMagicText({
    text: 'streaming paragraph',
    options: { segmenter: false },
    caret: true,
  });

  const host = fixture.nativeElement as HTMLElement;
  const openCaret = host.querySelector('[data-magic-text-caret]');

  expect(openCaret).not.toBeNull();

  fixture.componentRef.setInput('isComplete', true);
  fixture.detectChanges();

  const closedCaret = host.querySelector('[data-magic-text-caret]');

  expect(closedCaret).toBeNull();
});

test('does not render caret when only document root remains open', () => {
  const fixture = renderMagicText({
    text: 'Paragraph\n\n[^source',
    options: { segmenter: false },
    caret: true,
  });

  const host = fixture.nativeElement as HTMLElement;
  const paragraph = host.querySelector('p[data-magic-text-node="paragraph"]');
  const caret = host.querySelector('[data-magic-text-caret]');

  expect(paragraph?.textContent).toBe('Paragraph');
  expect(caret).toBeNull();
});

test('does not render caret when caret input is false', () => {
  const fixture = renderMagicText({
    text: 'streaming paragraph',
    options: { segmenter: false },
    caret: false,
  });

  const caret = (fixture.nativeElement as HTMLElement).querySelector(
    '[data-magic-text-caret]',
  );

  expect(caret).toBeNull();
});

test('table header detection handles both header and non-header parents', () => {
  const fixture = renderMagicText({
    text: '| a | b |\n| - | - |\n| c | d |',
    isComplete: true,
    options: { segmenter: false },
  });
  const component = fixture.componentInstance as unknown as {
    getNodeById: (nodeId: number) => unknown;
    isTableHeaderCell: (node: { parentId: number | null }) => boolean;
  };
  const originalGetNodeById = component.getNodeById;

  component.getNodeById = () => ({ type: 'table-row', isHeader: true });
  const headerCell = component.isTableHeaderCell({ parentId: 10 });

  component.getNodeById = () => ({ type: 'table-row', isHeader: false });
  const bodyCell = component.isTableHeaderCell({ parentId: 10 });

  component.getNodeById = originalGetNodeById;

  expect(headerCell).toBe(true);
  expect(bodyCell).toBe(false);
});

test('renders unresolved citations as plain superscript references', () => {
  const fixture = renderMagicText({
    text: 'Cite [^missing]',
    isComplete: true,
    options: { segmenter: false },
  });

  const unresolvedCitation = (
    fixture.nativeElement as HTMLElement
  ).querySelector('sup[role="doc-noteref"]');

  expect(unresolvedCitation?.textContent).toBe('[1]');
});

@Component({
  standalone: true,
  imports: [MagicText, MagicTextRenderNode],
  template: `
    <hb-magic-text
      [text]="text()"
      [isComplete]="true"
      [options]="{ segmenter: false }"
    >
      <ng-template hbMagicTextRenderNode nodeType="paragraph" let-node="node">
        <section data-custom-node="paragraph" [attr.data-open]="!node.closed">
          custom paragraph
        </section>
      </ng-template>
    </hb-magic-text>
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
  standalone: true,
  imports: [MagicText, MagicTextRenderNode],
  template: `
    <hb-magic-text
      [text]="text()"
      [isComplete]="true"
      [options]="{ segmenter: false }"
    >
      <ng-template hbMagicTextRenderNode nodeType="node" let-node="node">
        <span [attr.data-fallback-node]="node.type"></span>
      </ng-template>
    </hb-magic-text>
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
  standalone: true,
  imports: [MagicText, MagicTextRenderTextSegment],
  template: `
    <hb-magic-text
      [text]="text()"
      [isComplete]="true"
      [options]="{ segmenter: { granularity: 'grapheme' } }"
    >
      <ng-template hbMagicTextRenderTextSegment let-segment="segment">
        <mark data-custom-segment>{{ segment.text }}</mark>
      </ng-template>
    </hb-magic-text>
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
  standalone: true,
  imports: [MagicText, MagicTextRenderCaret],
  template: `
    <hb-magic-text
      [text]="text()"
      [options]="{ segmenter: false }"
      [caret]="true"
    >
      <ng-template hbMagicTextRenderCaret let-node="node">
        <span data-custom-caret [attr.data-open-node]="node.id">|</span>
      </ng-template>
    </hb-magic-text>
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
    '[data-magic-text-caret]',
  );

  expect(caret).not.toBeNull();
  expect(defaultCaret).toBeNull();
});

@Component({
  standalone: true,
  imports: [MagicText],
  template: `
    <ng-template #inputCaret let-node="node">
      <span data-input-caret [attr.data-node-id]="node.id">*</span>
    </ng-template>
    <hb-magic-text
      [text]="text()"
      [options]="{ segmenter: false }"
      [caret]="inputCaret"
    />
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
  const defaultCaret = host.querySelector('[data-magic-text-caret]');

  expect(inputCaret).not.toBeNull();
  expect(defaultCaret).toBeNull();
});

test('emits linkClick and citationClick events', () => {
  const fixture = renderMagicText({
    text: '[link](https://example.com) [^ref]\n\n[^ref]: Ref https://hashbrown.dev',
    isComplete: true,
    options: { segmenter: false },
  });

  const linkEvents: MagicTextLinkClickEvent[] = [];
  const citationEvents: MagicTextCitationClickEvent[] = [];

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

  expect(linkEvents.map((event) => event.url)).toEqual(['https://example.com']);
  expect(citationEvents.map((event) => event.citation.id)).toEqual(['ref']);
});

test('MagicText helper APIs return expected render contexts', () => {
  const fixture = renderMagicText({
    text: 'hello',
    isComplete: true,
    options: { segmenter: false },
  });

  const component = fixture.componentInstance as unknown as {
    parserState: () => { nodes: Array<{ type: string }> };
    getNodeRenderContext: (node: unknown) => { renderChildren: () => unknown };
    isTableHeaderCell: (node: unknown) => boolean;
  };
  const paragraph = component
    .parserState()
    .nodes.find((node) => node.type === 'paragraph');

  if (!paragraph) {
    throw new Error('Expected paragraph node');
  }

  const context = component.getNodeRenderContext(paragraph);
  const renderedChildren = context.renderChildren();
  const isHeaderWithoutParent = component.isTableHeaderCell({
    type: 'table-cell',
    parentId: null,
  });

  expect(Array.isArray(renderedChildren)).toBe(true);
  expect(isHeaderWithoutParent).toBe(false);
});

test('MagicText directive context guards always return true', () => {
  expect(
    MagicTextRenderNode.ngTemplateContextGuard(
      null as unknown as MagicTextRenderNode,
      {},
    ),
  ).toBe(true);
  expect(
    MagicTextRenderTextSegment.ngTemplateContextGuard(
      null as unknown as MagicTextRenderTextSegment,
      {},
    ),
  ).toBe(true);
  expect(
    MagicTextRenderCaret.ngTemplateContextGuard(
      null as unknown as MagicTextRenderCaret,
      {},
    ),
  ).toBe(true);
});
