import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RenderMessageComponent } from '../components';
import { createUiKit } from './ui-kit.fn';
import {
  exposeMarkdown,
  type MagicTextRendererComponentType,
} from './expose-markdown.fn';

@Component({
  selector: 'hb-custom-markdown-renderer',
  standalone: true,
  template: `
    <output
      data-custom-renderer
      [attr.data-options]="options()"
      [attr.data-complete]="isComplete()"
      >{{ text() }}</output
    >
  `,
})
class CustomMarkdownRendererComponent {
  text = input('');
  isComplete = input(false);
  options = input('unset');
}

@Component({
  selector: 'hb-custom-renderer-missing-text',
  standalone: true,
  template: `{{ isComplete() }}`,
})
class MissingTextRendererComponent {
  isComplete = input(false);
}

@Component({
  selector: 'hb-custom-renderer-missing-complete',
  standalone: true,
  template: `{{ text() }}`,
})
class MissingCompleteRendererComponent {
  text = input('');
}

test('exposeMarkdown uses defaults and exposes only children to the LLM', () => {
  const component = exposeMarkdown();

  expect(component.name).toBe('Markdown');
  expect(component.description).toContain(
    'Write all markdown into the `children` prop.',
  );
  expect(component.description).not.toContain(
    'For citations, use inline references',
  );
  expect(Object.keys(component.props ?? {})).toEqual(['children']);
  expect(component.props?.children).toBeTruthy();
});

test('exposeMarkdown appends citation guidance when citations is true', () => {
  const component = exposeMarkdown({ citations: true });

  expect(component.description).toContain(
    'For citations, use inline references',
  );
  expect(component.description).toContain(
    'Citation numbers are assigned by first inline reference',
  );
});

test('exposeMarkdown uses custom description verbatim', () => {
  const component = exposeMarkdown({
    citations: true,
    description: 'Custom markdown description.',
  });

  expect(component.description).toBe('Custom markdown description.');
});

test('exposeMarkdown maps node value and completion state to built-in MagicText', () => {
  const component = exposeMarkdown({ options: { segmenter: false } });

  const fixture = TestBed.configureTestingModule({
    imports: [component.component],
    providers: component.providers,
  }).createComponent(component.component);

  fixture.componentRef.setInput('children', {
    complete: false,
    partialValue: 'streaming paragraph',
    value: 'streaming paragraph',
  });
  fixture.detectChanges();

  const host = fixture.nativeElement as HTMLElement;
  const paragraph = host.querySelector('p[data-magic-text-node="paragraph"]');
  const caret = host.querySelector('[data-magic-text-caret]');

  expect(paragraph?.textContent).toBe('streaming paragraph');
  expect(paragraph?.getAttribute('data-node-open')).toBe('true');
  expect(caret).not.toBeNull();
});

test('exposeMarkdown uses partial markdown text when node value is absent', () => {
  const component = exposeMarkdown({ options: { segmenter: false } });

  const fixture = TestBed.configureTestingModule({
    imports: [component.component],
    providers: component.providers,
  }).createComponent(component.component);

  fixture.componentRef.setInput('children', {
    complete: false,
    partialValue: 'partial markdown',
  });
  fixture.detectChanges();

  const paragraph = (fixture.nativeElement as HTMLElement).querySelector(
    'p[data-magic-text-node="paragraph"]',
  );

  expect(paragraph?.textContent).toBe('partial markdown');
});

test('exposeMarkdown finalizes built-in rendering when children node is complete', () => {
  const component = exposeMarkdown({ options: { segmenter: false } });

  const fixture = TestBed.configureTestingModule({
    imports: [component.component],
    providers: component.providers,
  }).createComponent(component.component);

  fixture.componentRef.setInput('children', {
    complete: true,
    partialValue: 'done',
    value: 'done',
  });
  fixture.detectChanges();

  const paragraph = (fixture.nativeElement as HTMLElement).querySelector(
    'p[data-magic-text-node="paragraph"]',
  );
  const caret = (fixture.nativeElement as HTMLElement).querySelector(
    '[data-magic-text-caret]',
  );

  expect(paragraph?.getAttribute('data-node-open')).toBe('false');
  expect(caret).toBeNull();
});

test('exposeMarkdown uses custom renderer and maps only text/isComplete', () => {
  const component = exposeMarkdown({
    renderer: CustomMarkdownRendererComponent,
  });

  const fixture = TestBed.configureTestingModule({
    imports: [component.component],
    providers: component.providers,
  }).createComponent(component.component);

  fixture.componentRef.setInput('children', {
    complete: false,
    partialValue: 'custom stream',
    value: 'custom stream',
  });
  fixture.detectChanges();

  const output = (fixture.nativeElement as HTMLElement).querySelector(
    'output[data-custom-renderer]',
  );
  const defaultMarkdownNode = (
    fixture.nativeElement as HTMLElement
  ).querySelector('[data-magic-text-root]');

  expect(output?.textContent).toBe('custom stream');
  expect(output?.getAttribute('data-complete')).toBe('false');
  expect(output?.getAttribute('data-options')).toBe('unset');
  expect(defaultMarkdownNode).toBeNull();
});

test('exposeMarkdown custom renderer uses partialValue fallback and complete=true', () => {
  const component = exposeMarkdown({
    renderer: CustomMarkdownRendererComponent,
  });

  const fixture = TestBed.configureTestingModule({
    imports: [component.component],
    providers: component.providers,
  }).createComponent(component.component);

  fixture.componentRef.setInput('children', {
    complete: true,
    partialValue: 'partial custom',
  });
  fixture.detectChanges();

  const output = (fixture.nativeElement as HTMLElement).querySelector(
    'output[data-custom-renderer]',
  );

  expect(output?.textContent).toBe('partial custom');
  expect(output?.getAttribute('data-complete')).toBe('true');
});

test('exposeMarkdown throws when custom renderer is missing text input', () => {
  const act = () =>
    exposeMarkdown({
      renderer:
        MissingTextRendererComponent as unknown as MagicTextRendererComponentType,
    } as unknown as Parameters<typeof exposeMarkdown>[0]);

  expect(act).toThrow(
    'Custom markdown renderer must define both `text` and `isComplete` inputs.',
  );
});

test('exposeMarkdown throws when custom renderer is not an Angular component', () => {
  const act = () =>
    exposeMarkdown({
      renderer: {} as unknown as MagicTextRendererComponentType,
    } as unknown as Parameters<typeof exposeMarkdown>[0]);

  expect(act).toThrow('Custom markdown renderer must be an Angular component.');
});

test('exposeMarkdown throws when custom renderer is missing isComplete input', () => {
  const act = () =>
    exposeMarkdown({
      renderer:
        MissingCompleteRendererComponent as unknown as MagicTextRendererComponentType,
    } as unknown as Parameters<typeof exposeMarkdown>[0]);

  expect(act).toThrow(
    'Custom markdown renderer must define both `text` and `isComplete` inputs.',
  );
});

test('exposeMarkdown throws when custom renderer is combined with built-in options', () => {
  const act = () =>
    exposeMarkdown({
      renderer: CustomMarkdownRendererComponent,
      options: { segmenter: false },
    } as unknown as Parameters<typeof exposeMarkdown>[0]);

  expect(act).toThrow(
    'When `renderer` is provided, `options`, `caret`, `className`, `onLinkClick`, and `onCitationClick` are not supported.',
  );
});

@Component({
  standalone: true,
  imports: [RenderMessageComponent],
  template: `<hb-render-message [ui]="ui()" [uiKit]="uiKit" />`,
})
class MarkdownRenderHostComponent {
  uiKit = createUiKit({
    components: [
      exposeMarkdown({
        options: { segmenter: false },
        onLinkClick: (event) => {
          event.mouseEvent.preventDefault();
          this.linkClicks.update((count) => count + 1);
        },
        onCitationClick: () => this.citationClicks.update((count) => count + 1),
      }),
    ],
  });

  ui = signal({
    ui: [
      {
        Markdown: {
          props: {
            complete: true,
            partialValue: {
              children: {
                complete: true,
                partialValue:
                  '[link](https://example.com) cite [^ref]\n\n[^ref]: Ref https://hashbrown.dev',
                value:
                  '[link](https://example.com) cite [^ref]\n\n[^ref]: Ref https://hashbrown.dev',
              },
            },
            value: {
              children: {
                complete: true,
                partialValue:
                  '[link](https://example.com) cite [^ref]\n\n[^ref]: Ref https://hashbrown.dev',
                value:
                  '[link](https://example.com) cite [^ref]\n\n[^ref]: Ref https://hashbrown.dev',
              },
            },
          },
        },
      },
    ],
  });

  linkClicks = signal(0);
  citationClicks = signal(0);
}

test('exposeMarkdown callbacks are invoked through hb-render-message injector wiring', () => {
  const fixture = TestBed.configureTestingModule({
    imports: [MarkdownRenderHostComponent],
  }).createComponent(MarkdownRenderHostComponent);

  fixture.detectChanges();

  const host = fixture.nativeElement as HTMLElement;
  const link = host.querySelector(
    'a[href="https://example.com"]',
  ) as HTMLAnchorElement | null;
  const citation = host.querySelector(
    'sup a[role="doc-noteref"]',
  ) as HTMLAnchorElement | null;

  expect(link).not.toBeNull();
  expect(citation).not.toBeNull();

  link?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  citation?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  expect(fixture.componentInstance.linkClicks()).toBe(1);
  expect(fixture.componentInstance.citationClicks()).toBe(1);
});
