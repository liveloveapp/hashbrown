/* eslint-disable @angular-eslint/component-selector */
import { NgTemplateOutlet } from '@angular/common';
import { DomSanitizer, SafeUrl, SafeValue } from '@angular/platform-browser';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { readSignalLike } from '../utils/signals';
import { type SignalLike } from '../utils/types';

export type CitationDef = {
  id: string;
  label?: string | number;
  text?: string;
  href?: string;
  tooltip?: string;
};

export interface LinkClickEvent {
  href: string;
  label: string;
  cid?: string;
}

export interface CitationClickEvent {
  id: string;
  label: string | number;
}

export interface ParseErrorEvent {
  position: number;
  reason: string;
  snapshot: string;
}

type FeaturesInput = {
  bold?: boolean;
  italics?: boolean;
  links?: boolean;
  citations?: boolean;
};

type AnimationInput = {
  enable?: boolean;
  durationMs?: number;
  staggerMs?: number;
  highlight?: boolean;
};

type NodeKind = 'text' | 'strong' | 'em' | 'link' | 'citation';

interface RenderNode {
  id: string;
  kind: NodeKind;
  start: number;
  end: number;
  text?: string;
  fragments?: TextFragment[];
  children?: RenderNode[];
  attrs?: Record<string, unknown>;
}

interface TextFragment {
  id: string;
  text: string;
  start: number;
  end: number;
  isPunctuation: boolean;
  order: number;
}

interface ParserError {
  position: number;
  reason: string;
  snapshot: string;
}

interface ParseOutcome {
  nodes: RenderNode[];
  errors: ParserError[];
}

interface ResolvedFeatures {
  bold: boolean;
  italics: boolean;
  links: boolean;
  citations: boolean;
}

interface SegmentOptions {
  locale: string;
  granularity: 'grapheme' | 'word';
  revealPunctuationSeparately: boolean;
}

interface ViewModel {
  nodes: RenderNode[];
  fragments: TextFragment[];
  errors: ParserError[];
}

@Component({
  selector: 'hb-magic-text',
  imports: [NgTemplateOutlet],
  template: `
    <p
      class="magic-text"
      [class.magic-text--static]="!animationView().enable"
      [class.magic-text--highlight]="animationView().highlight"
      [style.--magic-text-duration]="animationView().duration"
      [style.--magic-text-stagger]="animationView().stagger"
      [attr.lang]="currentLocale()"
    >
      @if (nodes().length) {
        @for (node of nodes(); track node.id) {
          <ng-container
            [ngTemplateOutlet]="nodeTemplate"
            [ngTemplateOutletContext]="{ node: node }"
          />
        }
      }
    </p>

    <ng-template #nodeTemplate let-node="node">
      @switch (node.kind) {
        @case ('text') {
          @for (fragment of node.fragments ?? []; track fragment.id) {
            <span
              class="frag"
              [class.frag--punct]="fragment.isPunctuation"
              [style.--frag-index]="fragment.order"
              [attr.data-frag-id]="fragment.id"
              >{{ fragment.text }}</span
            >
          }
        }
        @case ('strong') {
          <strong>
            @for (child of node.children ?? []; track child.id) {
              <ng-container
                [ngTemplateOutlet]="nodeTemplate"
                [ngTemplateOutletContext]="{ node: child }"
              />
            }
          </strong>
        }
        @case ('em') {
          <em>
            @for (child of node.children ?? []; track child.id) {
              <ng-container
                [ngTemplateOutlet]="nodeTemplate"
                [ngTemplateOutletContext]="{ node: child }"
              />
            }
          </em>
        }
        @case ('link') {
          <a
            [attr.href]="getAttr(node, 'href')"
            [attr.title]="getAttr(node, 'title')"
            [attr.target]="getAttr(node, 'target')"
            [attr.rel]="getAttr(node, 'rel')"
            [attr.aria-label]="getAttr(node, 'ariaLabel')"
            (click)="handleLinkClick($event, node)"
          >
            @for (child of node.children ?? []; track child.id) {
              <ng-container
                [ngTemplateOutlet]="nodeTemplate"
                [ngTemplateOutletContext]="{ node: child }"
              />
            }
          </a>
        }
        @case ('citation') {
          <sup
            class="cite"
            role="doc-noteref"
            [attr.data-missing]="node.attrs?.['missing'] ? 'true' : null"
          >
            <a
              [attr.href]="getAttr(node, 'href')"
              [attr.title]="getAttr(node, 'title')"
              (click)="handleCitationClick($event, node)"
              >[{{ node.attrs?.['label'] }}]</a
            >
          </sup>
        }
      }
    </ng-template>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .magic-text {
        margin: 0;
        position: relative;
        color: inherit;
      }

      .magic-text--static .frag {
        animation: none;
        opacity: 1;
        background-image: none;
      }

      .frag {
        display: inline-block;
        white-space: pre;
        opacity: 0;
        --frag-index: 0;
        animation:
          magic-text-reveal var(--magic-text-duration, 500ms) ease forwards,
          magic-text-flash var(--magic-text-duration, 500ms) ease forwards;
        animation-delay: calc(
          var(--magic-text-stagger, 15ms) * var(--frag-index)
        );
        background-size: 100% 100%;
        background-repeat: no-repeat;
      }

      .magic-text--highlight .frag {
        background-image: linear-gradient(
          90deg,
          var(--magic-text-highlight, rgba(0, 0, 0, 0.06)),
          transparent
        );
      }

      .frag--punct {
        letter-spacing: 0.01em;
      }

      .magic-text--static .frag--punct {
        background-image: none;
      }

      .magic-text:not(.magic-text--highlight) .frag {
        background-image: none;
      }

      @keyframes magic-text-reveal {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes magic-text-flash {
        from {
          background-size: 100% 100%;
        }
        to {
          background-size: 0 100%;
        }
      }

      sup.cite {
        font-size: 0.75em;
        line-height: 1;
        vertical-align: top;
        margin-left: 0.1em;
      }

      sup.cite[data-missing='true'] {
        color: var(--magic-text-missing, currentColor);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExperimentalMagicText {
  readonly text = input.required<SignalLike<string>>();
  readonly citations = input<
    | SignalLike<Record<string, CitationDef> | CitationDef[] | undefined>
    | undefined
  >(undefined);
  readonly locale = input<string>();
  readonly granularity = input<'grapheme' | 'word'>('word');
  readonly revealPunctuationSeparately = input(true);
  readonly animation = input<
    SignalLike<AnimationInput | undefined> | undefined
  >(undefined);
  readonly linkTarget = input<'_self' | '_blank'>('_blank');
  readonly linkRel = input('noopener noreferrer');
  readonly sanitizeLinks = input(true);
  readonly features = input<SignalLike<FeaturesInput | undefined> | undefined>(
    undefined,
  );

  readonly linkClicked = output<LinkClickEvent>();
  readonly citationClicked = output<CitationClickEvent>();
  readonly parseError = output<ParseErrorEvent>();
  readonly renderComplete = output<{ totalFragments: number }>();
  readonly segmentsRevealed = output<{ count: number }>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly reduceMotion = signal(false);
  private readonly seenFragments = new Set<string>();
  private lastErrorKeys = new Set<string>();
  private previousTextSnapshot = '';

  private readonly resolvedFeatures = computed<ResolvedFeatures>(() => {
    const base: ResolvedFeatures = {
      bold: true,
      italics: true,
      links: true,
      citations: true,
    };
    const overrides = resolveSignalValue(this.features());
    if (overrides) {
      return {
        bold: overrides.bold ?? base.bold,
        italics: overrides.italics ?? base.italics,
        links: overrides.links ?? base.links,
        citations: overrides.citations ?? base.citations,
      };
    }
    return base;
  });

  private readonly currentText = computed(() => readSignalLike(this.text()));

  private readonly citationsMap = computed(() =>
    normalizeCitations(resolveSignalValue(this.citations()) ?? undefined),
  );

  readonly currentLocale = computed(() => this.locale() ?? inferLocale());

  readonly animationView = computed(() => {
    const config = resolveSignalValue(this.animation()) ?? {};
    const reduce = this.reduceMotion();
    const enable = (config.enable ?? true) && !reduce;
    const highlight = enable && (config.highlight ?? true);
    const duration = `${reduce ? 0 : (config.durationMs ?? 500)}ms`;
    const stagger = `${reduce ? 0 : (config.staggerMs ?? 15)}ms`;
    return { enable, highlight, duration, stagger };
  });

  readonly nodes = computed(() => this.viewState().nodes);

  private readonly viewState = computed<ViewModel>(() => {
    const textValue = this.currentText();
    const parseResult = parseMagicText(textValue, {
      features: this.resolvedFeatures(),
      citations: this.citationsMap(),
      linkTarget: this.linkTarget(),
      linkRel: this.linkRel(),
      sanitize: this.sanitizeLinks(),
      bypassHref: (href) => this.sanitizer.bypassSecurityTrustUrl(href),
    });

    const segmentOptions: SegmentOptions = {
      locale: this.currentLocale(),
      granularity: this.granularity(),
      revealPunctuationSeparately: this.revealPunctuationSeparately(),
    };

    let segmented = applySegmentation(parseResult.nodes, segmentOptions);
    if (
      segmentOptions.granularity === 'grapheme' &&
      segmented.fragments.length > 5000
    ) {
      segmented = applySegmentation(parseResult.nodes, {
        ...segmentOptions,
        granularity: 'word',
      });
    }

    return {
      nodes: segmented.nodes,
      fragments: segmented.fragments,
      errors: parseResult.errors,
    };
  });

  constructor() {
    this.observePrefersReducedMotion();

    effect(() => {
      const nextText = this.currentText();
      if (!nextText.startsWith(this.previousTextSnapshot)) {
        this.seenFragments.clear();
      }
      this.previousTextSnapshot = nextText;
    });

    effect(() => {
      const errors = this.viewState().errors;
      const nextKeys = new Set<string>();
      for (const error of errors) {
        const key = `${error.reason}:${error.position}:${error.snapshot}`;
        nextKeys.add(key);
        if (!this.lastErrorKeys.has(key)) {
          this.parseError.emit(error);
        }
      }
      this.lastErrorKeys = nextKeys;
    });

    effect(() => {
      const fragments = this.viewState().fragments;
      let newCount = 0;
      for (const fragment of fragments) {
        if (!this.seenFragments.has(fragment.id)) {
          this.seenFragments.add(fragment.id);
          newCount++;
        }
      }
      if (newCount > 0) {
        this.segmentsRevealed.emit({ count: newCount });
      }
      this.renderComplete.emit({ totalFragments: fragments.length });
    });
  }

  handleLinkClick(event: MouseEvent, node: RenderNode) {
    if (node.kind !== 'link') {
      return;
    }
    const attrs = node.attrs ?? {};
    const rawHref = extractHref(attrs);
    const labelValue = attrs['labelText'];
    const label = typeof labelValue === 'string' ? labelValue : '';
    const citationId = attrs['citationId'];
    this.linkClicked.emit({
      href: rawHref,
      label,
      cid: typeof citationId === 'string' ? citationId : undefined,
    });
    if (!rawHref) {
      event.preventDefault();
    }
  }

  handleCitationClick(event: MouseEvent, node: RenderNode) {
    if (node.kind !== 'citation') {
      return;
    }
    const attrs = node.attrs ?? {};
    const idValue = attrs['citationId'];
    const id = typeof idValue === 'string' ? idValue : '';
    const labelValue = attrs['label'];
    const label =
      typeof labelValue === 'number' || typeof labelValue === 'string'
        ? labelValue
        : '?';
    this.citationClicked.emit({ id, label });
    const hrefValue = extractHref(attrs);
    if (!hrefValue) {
      event.preventDefault();
    }
  }

  getAttr(node: RenderNode, key: string): string | SafeValue | null {
    const value = node.attrs?.[key];
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value === 'string') {
      return value;
    }
    return value as SafeValue;
  }

  private observePrefersReducedMotion() {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listener = (event: MediaQueryListEvent) => {
      this.reduceMotion.set(event.matches);
    };
    this.reduceMotion.set(query.matches);
    query.addEventListener('change', listener);
    this.destroyRef.onDestroy(() =>
      query.removeEventListener('change', listener),
    );
  }
}

function parseMagicText(
  source: string,
  options: {
    features: ResolvedFeatures;
    citations: Map<string, CitationDef>;
    linkTarget: '_self' | '_blank';
    linkRel: string;
    sanitize: boolean;
    bypassHref?: (href: string) => SafeUrl;
  },
): ParseOutcome {
  const errors: ParserError[] = [];
  const citationOrder = new Map<string, number>();
  let citationCounter = 1;

  const resolveCitation = (id: string, position: number, snapshot: string) => {
    const def = options.citations.get(id);
    if (!def) {
      errors.push({
        position,
        reason: 'missing_citation',
        snapshot,
      });
      return {
        label: '?',
        href: `#cite-${id}`,
        title: undefined,
        missing: true,
      };
    }
    if (!citationOrder.has(id)) {
      citationOrder.set(id, citationCounter++);
    }
    const label = def.label ?? citationOrder.get(id);

    return {
      label,
      href: def.href ?? `#cite-${id}`,
      title: def.tooltip ?? def.text,
      missing: false,
    };
  };

  const nodes = parseInline(source, {
    offset: 0,
    features: options.features,
    allowLinks: true,
    onCitation: (info) => {
      const { label, href, title, missing } = resolveCitation(
        info.id,
        info.start,
        info.snapshot,
      );
      return {
        id: `citation:${info.id}:${info.start}`,
        kind: 'citation',
        start: info.start,
        end: info.end,
        attrs: {
          label,
          href,
          title,
          missing,
          citationId: info.id,
          hrefRaw: href,
        },
      } satisfies RenderNode;
    },
    onLink: (info) =>
      resolveLink(
        info,
        {
          defaultTarget: options.linkTarget,
          defaultRel: options.linkRel,
          sanitize: options.sanitize,
          bypassHref: options.bypassHref,
        },
        errors,
      ),
    emitError: (error) => errors.push(error),
  });

  return { nodes, errors };
}

interface InlineContext {
  offset: number;
  features: ResolvedFeatures;
  allowLinks: boolean;
  onCitation: (info: CitationToken) => RenderNode | null;
  onLink: (info: LinkToken) => RenderNode | null;
  emitError: (error: ParserError) => void;
}

interface CitationToken {
  id: string;
  start: number;
  end: number;
  snapshot: string;
}

interface LinkToken {
  start: number;
  endLabel: number;
  end: number;
  label: string;
  labelOffset: number;
  destination: string;
  title?: string;
  attrs?: Record<string, string>;
  source: string;
}

interface LinkConfig {
  defaultTarget: '_self' | '_blank';
  defaultRel: string;
  sanitize: boolean;
  bypassHref?: (href: string) => SafeUrl;
}

function parseInline(input: string, ctx: InlineContext): RenderNode[] {
  const nodes: RenderNode[] = [];
  let buffer = '';
  let bufferStart = 0;
  let buffering = false;

  const flushText = (cursor: number) => {
    if (!buffer) {
      return;
    }
    const start = ctx.offset + bufferStart;
    const end = ctx.offset + cursor;
    nodes.push({
      id: `text:${start}-${end}`,
      kind: 'text',
      start,
      end,
      text: buffer,
    });
    buffer = '';
    buffering = false;
  };

  const startBuffer = (index: number) => {
    if (!buffering) {
      buffering = true;
      bufferStart = index;
    }
  };

  let i = 0;
  while (i < input.length) {
    const char = input[i];

    if (char === '\\') {
      const next = input[i + 1];
      if (next) {
        if (!buffering) {
          buffering = true;
          bufferStart = i;
        }
        buffer += next;
        i += 2;
        continue;
      }
    }

    if (ctx.features.citations && char === '[' && input[i + 1] === '^') {
      const citation = tryParseCitation(input, i);
      if (citation) {
        flushText(i);
        const node = ctx.onCitation({
          id: citation.id,
          start: ctx.offset + i,
          end: ctx.offset + citation.end,
          snapshot: input.slice(i, citation.end),
        });
        if (node) {
          nodes.push(node);
          i = citation.end;
          continue;
        }
      }
    }

    if (ctx.features.links && ctx.allowLinks && char === '[') {
      const linkToken = tryParseLink(input, i);
      if (linkToken) {
        const node = ctx.onLink({
          ...linkToken,
          source: input,
        });
        if (node) {
          flushText(i);
          nodes.push(node);
          i = linkToken.end;
          continue;
        }
      }
    }

    const boldMarker = detectBoldMarker(input, i);
    if (boldMarker) {
      if (ctx.features.bold) {
        const closing = findClosing(
          input,
          boldMarker.marker,
          boldMarker.start + boldMarker.marker.length,
        );
        if (closing !== -1) {
          flushText(i);
          const inner = input.slice(
            boldMarker.start + boldMarker.marker.length,
            closing,
          );
          const children = parseInline(inner, {
            ...ctx,
            offset: ctx.offset + boldMarker.start + boldMarker.marker.length,
          });
          nodes.push({
            id: `strong:${ctx.offset + boldMarker.start}-${ctx.offset + closing + boldMarker.marker.length}`,
            kind: 'strong',
            start: ctx.offset + boldMarker.start,
            end: ctx.offset + closing + boldMarker.marker.length,
            children,
          });
          i = closing + boldMarker.marker.length;
          continue;
        }
      }
      startBuffer(i);
      buffer += boldMarker.marker;
      i += boldMarker.marker.length;
      continue;
    }

    if (
      ctx.features.italics &&
      isItalicDelimiter(char) &&
      input[i + 1] !== char
    ) {
      const closing = findClosing(input, char, i + 1);
      if (closing !== -1) {
        flushText(i);
        const inner = input.slice(i + 1, closing);
        const children = parseInline(inner, {
          ...ctx,
          offset: ctx.offset + i + 1,
        });
        nodes.push({
          id: `em:${ctx.offset + i}-${ctx.offset + closing + 1}`,
          kind: 'em',
          start: ctx.offset + i,
          end: ctx.offset + closing + 1,
          children,
        });
        i = closing + 1;
        continue;
      }
    }

    startBuffer(i);
    buffer += char;
    i += 1;
  }

  flushText(input.length);
  return nodes;
}

function tryParseCitation(
  input: string,
  start: number,
): { id: string; end: number } | null {
  let cursor = start + 2;
  let id = '';
  while (cursor < input.length) {
    const char = input[cursor];
    if (char === '\\') {
      cursor += 2;
      continue;
    }
    if (char === ']') {
      id = input.slice(start + 2, cursor).trim();
      break;
    }
    cursor += 1;
  }
  if (!id || cursor >= input.length || input[cursor] !== ']') {
    return null;
  }
  return { id, end: cursor + 1 };
}

function tryParseLink(input: string, start: number) {
  const labelEnd = findClosingBracket(input, start + 1);
  if (labelEnd === -1) {
    return null;
  }
  let cursor = labelEnd + 1;
  while (cursor < input.length && input[cursor] === ' ') {
    cursor++;
  }
  if (input[cursor] !== '(') {
    return null;
  }
  cursor += 1;
  const destStart = cursor;
  let destination = '';
  let depth = 0;
  let title: string | undefined;
  while (cursor < input.length) {
    const char = input[cursor];
    if (char === '\\') {
      cursor += 2;
      continue;
    }
    if (char === '(') {
      depth++;
      cursor += 1;
      continue;
    }
    if (char === ')') {
      if (depth === 0) {
        break;
      }
      depth--;
      cursor += 1;
      continue;
    }
    if ((char === '"' || char === "'") && depth === 0) {
      const prev = input[cursor - 1];
      if (!prev || /\s/.test(prev)) {
        break;
      }
    }
    cursor += 1;
  }
  destination = input.slice(destStart, cursor).trim();

  if (input[cursor] === '"' || input[cursor] === "'") {
    const quote = input[cursor];
    cursor += 1;
    const titleStart = cursor;
    while (cursor < input.length && input[cursor] !== quote) {
      cursor += 1;
    }
    if (cursor >= input.length) {
      return null;
    }
    title = input.slice(titleStart, cursor);
    cursor += 1;
    while (cursor < input.length && input[cursor] !== ')') {
      if (input[cursor] !== ' ') {
        return null;
      }
      cursor += 1;
    }
  }

  if (input[cursor] !== ')') {
    return null;
  }
  cursor += 1;

  let attrs: Record<string, string> | undefined;
  let lookahead = cursor;
  while (lookahead < input.length && input[lookahead] === ' ') {
    lookahead++;
  }
  if (input[lookahead] === '{') {
    const attrsEnd = findClosingBrace(input, lookahead);
    if (attrsEnd === -1) {
      return null;
    }
    const attrsContent = input.slice(lookahead + 1, attrsEnd);
    attrs = parseAttributeList(attrsContent);
    cursor = attrsEnd + 1;
  }

  return {
    start,
    endLabel: labelEnd,
    end: cursor,
    label: input.slice(start + 1, labelEnd),
    labelOffset: start + 1,
    destination,
    title,
    attrs,
    source: '',
  } satisfies LinkToken;
}

function detectBoldMarker(input: string, index: number) {
  const char = input[index];
  if (!char) {
    return null;
  }
  if ((char === '*' || char === '_') && input[index + 1] === char) {
    return { marker: char + char, start: index };
  }
  return null;
}

function findClosing(input: string, marker: string, from: number) {
  let cursor = from;
  while (cursor < input.length) {
    if (input[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (input.startsWith(marker, cursor)) {
      return cursor;
    }
    cursor += 1;
  }
  return -1;
}

function isItalicDelimiter(char: string) {
  return char === '*' || char === '_';
}

function findClosingBracket(input: string, from: number) {
  let depth = 0;
  for (let i = from; i < input.length; i++) {
    const char = input[i];
    if (char === '\\') {
      i++;
      continue;
    }
    if (char === '[') {
      depth++;
    }
    if (char === ']') {
      if (depth === 0) {
        return i;
      }
      depth--;
    }
  }
  return -1;
}

function findClosingBrace(input: string, start: number) {
  let depth = 0;
  for (let i = start; i < input.length; i++) {
    const char = input[i];
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function parseAttributeList(content: string) {
  const attrs: Record<string, string> = {};
  const pattern = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of content.matchAll(pattern)) {
    const key = match[1]?.toLowerCase();
    const value = match[2] ?? match[3] ?? '';
    if (key) {
      attrs[key] = value;
    }
  }
  return Object.keys(attrs).length ? attrs : undefined;
}

function resolveLink(
  info: LinkToken,
  config: LinkConfig,
  errors: ParserError[],
): RenderNode | null {
  const snapshot = info.source.slice(info.start, info.end);
  if (!info.destination) {
    errors.push({
      position: info.start,
      reason: 'invalid_link_syntax',
      snapshot,
    });
    return null;
  }

  const href = info.destination.trim();
  if (config.sanitize && !isAllowedProtocol(href)) {
    errors.push({
      position: info.start,
      reason: 'disallowed_protocol',
      snapshot,
    });
    return null;
  }

  const attrs = info.attrs ?? {};
  const resolvedAttrs: Record<string, unknown> = {};
  const labelNodes = parseInline(info.label, {
    offset: info.labelOffset,
    features: { bold: true, italics: true, links: false, citations: false },
    allowLinks: false,
    onCitation: () => null,
    onLink: () => null,
    emitError: () => void 0,
  });
  const labelText = extractPlainText(labelNodes);

  const attrHref = config.sanitize
    ? href
    : config.bypassHref
      ? config.bypassHref(href)
      : href;
  resolvedAttrs['href'] = attrHref;
  resolvedAttrs['hrefRaw'] = href;
  resolvedAttrs['title'] = info.title;
  resolvedAttrs['target'] = attrs['target'] ?? config.defaultTarget;
  if (
    resolvedAttrs['target'] !== '_blank' &&
    resolvedAttrs['target'] !== '_self'
  ) {
    errors.push({
      position: info.start,
      reason: 'invalid_link_target',
      snapshot,
    });
    resolvedAttrs['target'] = config.defaultTarget;
  }
  resolvedAttrs['rel'] = attrs['rel'] ?? config.defaultRel;
  if (resolvedAttrs['target'] === '_blank' && !attrs['rel']) {
    resolvedAttrs['rel'] = 'noopener noreferrer';
  }
  if (attrs['alt']) {
    resolvedAttrs['ariaLabel'] = attrs['alt'];
  }
  resolvedAttrs['labelText'] = labelText;

  for (const key of Object.keys(attrs)) {
    if (!['alt', 'target', 'rel'].includes(key)) {
      errors.push({
        position: info.start,
        reason: 'unknown_link_attribute',
        snapshot,
      });
    }
  }

  return {
    id: `link:${info.start}-${info.end}`,
    kind: 'link',
    start: info.start,
    end: info.end,
    attrs: resolvedAttrs,
    children: labelNodes,
  } satisfies RenderNode;
}

function isAllowedProtocol(href: string) {
  const lower = href.trim().toLowerCase();
  return (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:') ||
    lower.startsWith('/') ||
    lower.startsWith('./') ||
    lower.startsWith('../') ||
    lower.startsWith('#')
  );
}

function extractPlainText(nodes: RenderNode[]): string {
  let text = '';
  for (const node of nodes) {
    if (node.kind === 'text' && node.text) {
      text += node.text;
    } else if (node.children) {
      text += extractPlainText(node.children);
    }
  }
  return text;
}

function applySegmentation(nodes: RenderNode[], options: SegmentOptions) {
  const fragments: TextFragment[] = [];
  const cloned = nodes.map((node) =>
    cloneNodeWithSegments(node, options, fragments),
  );
  assignFragmentOrder(cloned);
  return { nodes: cloned, fragments };
}

function cloneNodeWithSegments(
  node: RenderNode,
  options: SegmentOptions,
  fragments: TextFragment[],
): RenderNode {
  if (node.kind === 'text' && node.text) {
    const segs = segmentText(node.text, node.start, options);
    fragments.push(...segs);
    return { ...node, fragments: segs };
  }
  if (node.children) {
    return {
      ...node,
      children: node.children.map((child) =>
        cloneNodeWithSegments(child, options, fragments),
      ),
    };
  }
  return { ...node };
}

function segmentText(text: string, offset: number, options: SegmentOptions) {
  const segmenter = createSegmenter(options.locale, options.granularity);
  const rawFragments: TextFragment[] = [];

  if (segmenter) {
    const iterator = segmenter.segment(text);
    for (const item of iterator) {
      const start = offset + item.index;
      const end = start + item.segment.length;
      const punctuation = isPunctuation(item.segment);
      const whitespace = isWhitespace(item.segment);
      if (
        options.granularity === 'word' &&
        !item.isWordLike &&
        !whitespace &&
        !(options.revealPunctuationSeparately && punctuation)
      ) {
        continue;
      }
      rawFragments.push({
        id: `frag:${start}-${end}`,
        text: item.segment,
        start,
        end,
        isPunctuation: punctuation,
        order: 0,
      });
    }
  } else {
    if (options.granularity === 'word') {
      const matcher = /([\p{L}\p{N}]+|\s+|[^\p{L}\p{N}\s]+)/gu;
      for (const match of text.matchAll(matcher)) {
        if (!match.index && match.index !== 0) {
          continue;
        }
        const start = offset + match.index;
        const end = start + match[0].length;
        const segment = match[0];
        const wordLike = /[\p{L}\p{N}]/u.test(segment);
        const punctuation = isPunctuation(segment);
        const whitespace = isWhitespace(segment);
        if (!wordLike && !whitespace && !(options.revealPunctuationSeparately && punctuation)) {
          continue;
        }
        rawFragments.push({
          id: `frag:${start}-${end}`,
          text: segment,
          start,
          end,
          isPunctuation: punctuation,
          order: 0,
        });
      }
    } else {
      let cursor = 0;
      for (const grapheme of Array.from(text)) {
        const start = offset + cursor;
        const end = start + grapheme.length;
        rawFragments.push({
          id: `frag:${start}-${end}`,
          text: grapheme,
          start,
          end,
          isPunctuation: isPunctuation(grapheme),
          order: 0,
        });
        cursor += grapheme.length;
      }
    }
  }

  const normalized = options.revealPunctuationSeparately
    ? attachInlinePunctuation(rawFragments)
    : mergePunctuation(rawFragments);
  return normalized;
}

type IntlSegmenterResult = {
  segment: string;
  index: number;
  isWordLike?: boolean;
};

type IntlSegmenterCtor = new (
  locales?: string | string[],
  options?: { granularity?: 'grapheme' | 'word' | 'sentence' },
) => {
  segment(input: string): IterableIterator<IntlSegmenterResult>;
};

function createSegmenter(locale: string, granularity: 'grapheme' | 'word') {
  try {
    const intlWithSegmenter = Intl as typeof Intl & {
      Segmenter?: IntlSegmenterCtor;
    };
    if (typeof intlWithSegmenter !== 'undefined' && intlWithSegmenter.Segmenter) {
      return new intlWithSegmenter.Segmenter(locale, { granularity });
    }
  } catch {
    // noop
  }
  return null;
}

function mergePunctuation(segments: TextFragment[]) {
  const merged: TextFragment[] = [];
  for (const fragment of segments) {
    if (fragment.isPunctuation && merged.length) {
      const last = merged[merged.length - 1];
      last.text += fragment.text;
      last.end = fragment.end;
      last.id = `frag:${last.start}-${last.end}`;
    } else {
      merged.push({ ...fragment });
    }
  }
  return merged;
}

function attachInlinePunctuation(segments: TextFragment[]) {
  const merged: TextFragment[] = [];
  for (const fragment of segments) {
    if (
      fragment.isPunctuation &&
      !isWhitespace(fragment.text) &&
      merged.length > 0
    ) {
      const last = merged[merged.length - 1];
      if (!isWhitespace(last.text)) {
        last.text += fragment.text;
        last.end = fragment.end;
        last.id = `frag:${last.start}-${last.end}`;
        continue;
      }
    }
    merged.push(fragment);
  }
  return merged;
}

function assignFragmentOrder(nodes: RenderNode[]) {
  let order = 0;
  const visit = (node: RenderNode) => {
    if (node.kind === 'text' && node.fragments) {
      for (const fragment of node.fragments) {
        fragment.order = order++;
      }
    }
    if (node.children) {
      node.children.forEach(visit);
    }
  };
  nodes.forEach(visit);
}

function isPunctuation(input: string) {
  return /\p{P}+/u.test(input);
}

function isWhitespace(input: string) {
  return /\s+/u.test(input);
}

function normalizeCitations(
  source?: Record<string, CitationDef> | CitationDef[],
) {
  const map = new Map<string, CitationDef>();
  if (!source) {
    return map;
  }
  if (Array.isArray(source)) {
    for (const entry of source) {
      if (entry?.id) {
        map.set(entry.id, entry);
      }
    }
  } else {
    for (const [key, value] of Object.entries(source)) {
      if (value) {
        map.set(key, { ...value, id: value.id ?? key });
      }
    }
  }
  return map;
}

function extractHref(attrs: Record<string, unknown>) {
  const raw = attrs['hrefRaw'];
  if (typeof raw === 'string') {
    return raw;
  }
  const fallback = attrs['href'];
  return typeof fallback === 'string' ? fallback : '';
}

function resolveSignalValue<T>(
  value: SignalLike<T> | undefined,
): T | undefined {
  if (value === undefined) {
    return undefined;
  }
  return readSignalLike(value);
}

function inferLocale() {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }
  return 'en';
}
