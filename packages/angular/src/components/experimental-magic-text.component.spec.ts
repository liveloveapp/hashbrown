import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import {
  CitationClickEvent,
  CitationDef,
  ExperimentalMagicText,
  LinkClickEvent,
} from './experimental-magic-text.component';

type SetupOptions = {
  citations?: Record<string, CitationDef> | CitationDef[];
  features?: {
    bold?: boolean;
    italics?: boolean;
    links?: boolean;
    citations?: boolean;
  };
  animation?: {
    enable?: boolean;
    durationMs?: number;
    staggerMs?: number;
    highlight?: boolean;
  };
  revealPunctuationSeparately?: boolean;
  granularity?: 'grapheme' | 'word';
  linkTarget?: '_self' | '_blank';
  linkRel?: string;
  sanitizeLinks?: boolean;
};

describe('ExperimentalMagicText', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExperimentalMagicText],
    }).compileComponents();
  });

  function createComponent(initialText: string, options: SetupOptions = {}) {
    const fixture = TestBed.createComponent(ExperimentalMagicText);
    const textSource = signal(initialText);
    fixture.componentRef.setInput('text', textSource);

    if (options.citations !== undefined) {
      fixture.componentRef.setInput('citations', options.citations);
    }

    if (options.features !== undefined) {
      fixture.componentRef.setInput('features', options.features);
    }

    if (options.animation !== undefined) {
      fixture.componentRef.setInput('animation', options.animation);
    }

    if (options.revealPunctuationSeparately !== undefined) {
      fixture.componentRef.setInput(
        'revealPunctuationSeparately',
        options.revealPunctuationSeparately,
      );
    }

    if (options.granularity !== undefined) {
      fixture.componentRef.setInput('granularity', options.granularity);
    }

    if (options.linkTarget !== undefined) {
      fixture.componentRef.setInput('linkTarget', options.linkTarget);
    }

    if (options.linkRel !== undefined) {
      fixture.componentRef.setInput('linkRel', options.linkRel);
    }

    if (options.sanitizeLinks !== undefined) {
      fixture.componentRef.setInput('sanitizeLinks', options.sanitizeLinks);
    }

    fixture.detectChanges();

    return { fixture, component: fixture.componentInstance, textSource };
  }

  function getParagraph(fixture: ComponentFixture<ExperimentalMagicText>) {
    return fixture.nativeElement.querySelector('p');
  }

  it('renders bold and italic content with nesting', () => {
    const { fixture } = createComponent(
      'We love **Angular** and _Segmenter with **nested** styles_.',
    );

    const paragraph = getParagraph(fixture);
    const strong = paragraph.querySelector('strong');
    const italic = paragraph.querySelector('em');

    expect(paragraph.textContent?.trim()).toBe(
      'We love Angular and Segmenter with nested styles.',
    );
    expect(strong?.textContent).toBe('Angular');
    expect(italic?.querySelector('strong')?.textContent).toBe('nested');
  });

  it('renders accessible links with title and aria-label', () => {
    const { fixture } = createComponent(
      'See [MDN](https://developer.mozilla.org/ "MDN Homepage"){alt="Mozilla" target="_self" rel="nofollow"}.',
    );

    const anchor = getParagraph(fixture).querySelector('a');

    expect(anchor).toBeTruthy();
    expect(anchor?.getAttribute('href')).toBe('https://developer.mozilla.org/');
    expect(anchor?.getAttribute('title')).toBe('MDN Homepage');
    expect(anchor?.getAttribute('aria-label')).toBe('Mozilla');
    expect(anchor?.getAttribute('target')).toBe('_self');
    expect(anchor?.getAttribute('rel')).toBe('nofollow');
  });

  it('treats partial bold markers as literal until closed and upgrades once complete', () => {
    const fixture = TestBed.createComponent(ExperimentalMagicText);
    const textSource = signal('We love **Ang');
    fixture.componentRef.setInput('text', textSource);
    fixture.detectChanges();

    const paragraph = getParagraph(fixture);
    const initialText = paragraph.textContent ?? '';
    const initialStrong = paragraph.querySelector('strong');

    textSource.set('We love **Angular** and Segmenter.');
    fixture.detectChanges();
    const strong = getParagraph(fixture).querySelector('strong');

    expect(initialText).toContain('**Ang');
    expect(initialStrong).toBeNull();
    expect(strong?.textContent).toBe('Angular');
  });

  it('sanitizes disallowed protocols and emits parse errors', () => {
    const fixture = TestBed.createComponent(ExperimentalMagicText);
    const parseErrors: string[] = [];
    fixture.componentInstance.parseError.subscribe((err) =>
      parseErrors.push(err.reason),
    );
    fixture.componentRef.setInput('text', signal('Avoid [bad](javascript:alert(1)).'));
    fixture.detectChanges();

    const paragraph = getParagraph(fixture);

    expect(paragraph.textContent).toContain('[bad](javascript:alert(1))');
    expect(parseErrors).toContain('disallowed_protocol');
  });

  it('renders citations with numbering and metadata', () => {
    const citations: Record<string, CitationDef> = {
      doe2020: {
        id: 'doe2020',
        text: 'Doe, J. (2020). Magic Text.',
        href: 'https://doi.org/10.1234/doe.2020',
      },
      smith2019: {
        id: 'smith2019',
        label: 'B',
        text: 'Smith (2019). Internal memo.',
      },
    };

    const { fixture } = createComponent(
      'See Doe [^doe2020] and Smith [^smith2019].',
      { citations },
    );

    const superscripts = Array.from(
      getParagraph(fixture).querySelectorAll('sup.cite'),
    );

    expect(superscripts).toHaveLength(2);

    const [first, second] = superscripts;
    expect(first.querySelector('a')?.textContent).toBe('[1]');
    expect(first.querySelector('a')?.getAttribute('href')).toBe(
      'https://doi.org/10.1234/doe.2020',
    );
    expect(first.querySelector('a')?.getAttribute('title')).toContain('Doe');

    expect(second.querySelector('a')?.textContent).toBe('[B]');
    expect(second.querySelector('a')?.getAttribute('href')).toBe('#cite-smith2019');
    expect(second.querySelector('a')?.getAttribute('title')).toContain('Smith');
  });

  it('marks missing citations and reports errors', () => {
    const fixture = TestBed.createComponent(ExperimentalMagicText);
    const errors: string[] = [];
    fixture.componentInstance.parseError.subscribe((err) =>
      errors.push(err.reason),
    );
    fixture.componentRef.setInput('text', signal('Unknown ref [^missing].'));
    fixture.detectChanges();

    const sup = getParagraph(fixture).querySelector('sup.cite');

    expect(sup?.getAttribute('data-missing')).toBe('true');
    expect(sup?.querySelector('a')?.textContent).toBe('[?]');
    expect(errors).toContain('missing_citation');
  });

  it('respects escape sequences for markdown characters', () => {
    const { fixture } = createComponent(
      'Treat \\*stars\\* and \\[brackets\\] literally.',
    );
    const paragraph = getParagraph(fixture);

    expect(paragraph.textContent).toContain('*stars*');
    expect(paragraph.textContent).toContain('[brackets]');
  });

  it('honors feature toggles for emphasis and links', () => {
    const { fixture } = createComponent(
      '**Bold** and [link](https://example.com)',
      {
        features: { bold: false, links: false },
      },
    );

    const paragraph = getParagraph(fixture);

    expect(paragraph.textContent).toContain('**Bold**');
    expect(paragraph.textContent).toContain('[link](https://example.com)');
    expect(paragraph.querySelector('strong')).toBeNull();
    expect(paragraph.querySelector('a')).toBeNull();
  });

  it('emits linkClicked events with metadata', () => {
    const fixture = TestBed.createComponent(ExperimentalMagicText);
    const clicks: LinkClickEvent[] = [];
    fixture.componentInstance.linkClicked.subscribe((event) =>
      clicks.push(event),
    );
    fixture.componentRef.setInput(
      'text',
      signal('Visit [MDN](https://developer.mozilla.org/){alt="Docs"}'),
    );
    fixture.detectChanges();

    const anchor = getParagraph(fixture).querySelector('a');
    anchor?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toMatchObject({
      href: 'https://developer.mozilla.org/',
      label: 'MDN',
    });
  });

  it('emits citationClicked events when references are activated', () => {
    const citations: CitationDef[] = [
      { id: 'cite-one', text: 'Example citation.' },
    ];
    const fixture = TestBed.createComponent(ExperimentalMagicText);
    const clicks: CitationClickEvent[] = [];
    fixture.componentInstance.citationClicked.subscribe((event) =>
      clicks.push(event),
    );
    fixture.componentRef.setInput('text', signal('See [^cite-one].'));
    fixture.componentRef.setInput('citations', citations);
    fixture.detectChanges();

    const sup = getParagraph(fixture).querySelector('sup.cite');
    sup?.querySelector('a')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );

    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toMatchObject({ id: 'cite-one', label: 1 });
  });

  it('emits renderComplete and segmentsRevealed events as text streams in', () => {
    const fixture = TestBed.createComponent(ExperimentalMagicText);
    const segments: number[] = [];
    const renders: number[] = [];
    fixture.componentInstance.segmentsRevealed.subscribe((event) =>
      segments.push(event.count),
    );
    fixture.componentInstance.renderComplete.subscribe((event) =>
      renders.push(event.totalFragments),
    );
    const text = signal('Hello');
    fixture.componentRef.setInput('text', text);
    fixture.detectChanges();

    const initialSegments = segments.at(-1);
    const initialRenders = renders.at(-1);

    text.set('Hello, world');
    fixture.detectChanges();
    const updatedSegments = segments.at(-1);
    const updatedRenders = renders.at(-1);

    expect(initialSegments).toBeGreaterThan(0);
    expect(initialRenders).toBeGreaterThan(0);
    expect(updatedSegments).toBeGreaterThan(0);
    expect(updatedRenders).toBeGreaterThan(initialRenders! - 1);
  });

  it('supports disabling punctuation-only fragments', () => {
    const { fixture: defaultFixture } = createComponent('Hi !');
    const { fixture: mergedFixture } = createComponent('Hi!', {
      revealPunctuationSeparately: false,
    });
    const defaultFragments = defaultFixture.nativeElement.querySelectorAll(
      '.frag',
    ).length;
    const mergedFragments = mergedFixture.nativeElement.querySelectorAll(
      '.frag',
    ).length;

    expect(defaultFragments).toBeGreaterThan(mergedFragments);
  });

  it('uses word granularity by default while supporting grapheme mode', () => {
    const { fixture: defaultFixture } = createComponent('One two three');
    const defaultFragments = Array.from(
      defaultFixture.nativeElement.querySelectorAll('.frag'),
    ).map((node) => node.textContent ?? '');

    const { fixture: graphemeFixture } = createComponent('One', {
      granularity: 'grapheme',
    });
    const graphemeFragments = Array.from(
      graphemeFixture.nativeElement.querySelectorAll('.frag'),
    ).map((node) => node.textContent ?? '');

    expect(defaultFragments).toEqual(['One', ' ', 'two', ' ', 'three']);
    expect(graphemeFragments.join('')).toBe('One');
    expect(graphemeFragments.length).toBeGreaterThan(1);
  });

  it('preserves whitespace between words when using word granularity', () => {
    const { fixture } = createComponent('Hi  there\nnext', {
      granularity: 'word',
    });
    const paragraph = getParagraph(fixture);
    const fragments = Array.from(paragraph.querySelectorAll('.frag')).map(
      (node) => node.textContent ?? '',
    );

    expect(paragraph.textContent).toBe('Hi  there\nnext');
    expect(fragments).toEqual(['Hi', '  ', 'there', '\n', 'next']);
  });

  it('keeps trailing punctuation attached to the preceding word', () => {
    const { fixture } = createComponent('Some sentence.');
    const fragments = Array.from(
      fixture.nativeElement.querySelectorAll('.frag'),
    ).map((node) => node.textContent ?? '');

    expect(fragments).toEqual(['Some', ' ', 'sentence.']);
  });

  it('reports unknown link attribute keys but preserves valid attributes', () => {
    const fixture = TestBed.createComponent(ExperimentalMagicText);
    const errors: string[] = [];
    fixture.componentInstance.parseError.subscribe((err) =>
      errors.push(err.reason),
    );
    fixture.componentRef.setInput(
      'text',
      signal('[x](https://example.com){foo="bar" alt="Alt text"}'),
    );
    fixture.detectChanges();

    const anchor = getParagraph(fixture).querySelector('a');

    expect(anchor?.getAttribute('aria-label')).toBe('Alt text');
    expect(errors).toContain('unknown_link_attribute');
  });

  it('allows unsafe protocols when sanitizeLinks is false', () => {
    const { fixture } = createComponent('Go [here](javascript:alert(1))', {
      sanitizeLinks: false,
    });
    const anchor = getParagraph(fixture).querySelector('a');

    expect(anchor?.getAttribute('href')).toBe('javascript:alert(1)');
  });

  it('permits relative links when sanitization is enabled', () => {
    const fixture = TestBed.createComponent(ExperimentalMagicText);
    const errors: string[] = [];
    fixture.componentInstance.parseError.subscribe((err) =>
      errors.push(err.reason),
    );
    fixture.componentRef.setInput(
      'text',
      signal('[Sodium management across fast-food chains](/fastfood-sodium-trends)'),
    );
    fixture.detectChanges();

    const anchor = getParagraph(fixture).querySelector('a');

    expect(anchor?.getAttribute('href')).toBe('/fastfood-sodium-trends');
    expect(errors).toHaveLength(0);
  });

  it('preserves spaces that follow links', () => {
    const { fixture } = createComponent(
      'Highlight [high-protein choice](https://example.com) compared insights.',
    );
    const paragraph = getParagraph(fixture);

    expect(paragraph.textContent).toBe(
      'Highlight high-protein choice compared insights.',
    );
  });

  it('disables reveal animations when animation.enable is false', () => {
    const { fixture } = createComponent('Magic text', {
      animation: { enable: false },
    });
    const paragraph = getParagraph(fixture);

    expect(paragraph.classList).toContain('magic-text');
    expect(paragraph.classList.contains('magic-text--static')).toBe(true);
  });
});
