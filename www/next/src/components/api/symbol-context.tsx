import type { ReactNode } from 'react';
import {
  type ApiMember,
  type ApiSymbol,
  listSymbolPages,
  loadFromCanonicalReference,
} from '../../lib/api-reference';
import {
  CANONICAL_REFERENCE_PATTERN,
  parseCanonicalReference,
  symbolHref,
} from '../../lib/canonical-reference';
import { type MarkdownComponents, renderMarkdown } from '../../lib/markdown';
import { docsComponents } from '../docs-components';
import { SymbolLink } from '../SymbolLink';
import type { Excerpt, HighlightedCode } from './excerpt';
import { createExcerptHighlighter } from './highlight-excerpt';
import { methodsOf } from './symbol-model';
import { SymbolPopover } from './SymbolPopover';
import { SymbolPopoverContent } from './SymbolPopoverContent';

/** Where a referenced symbol links to, and its popover when it has a page here. */
export interface ReferenceTarget {
  href: string;
  external: boolean;
  popover?: ReactNode;
}

/**
 * Everything the synchronous symbol components need that is async or
 * build-time only: highlighting, pre-rendered markdown and reference targets.
 */
export interface SymbolRenderContext {
  /** Highlight an excerpt with the site's Shiki theme. */
  highlight: (excerpt: Excerpt) => HighlightedCode;
  /** Pre-rendered block markdown for a doc string collected from the symbol. */
  markdown: (source: string) => ReactNode;
  /** Pre-rendered inline markdown (no wrapping paragraph). */
  inlineMarkdown: (source: string) => ReactNode;
  /** The link for a canonical reference, or `undefined` to render plain text. */
  linkTarget: (reference: string) => ReferenceTarget | undefined;
}

/** Options for {@link buildSymbolContext}. */
export interface BuildSymbolContextOptions {
  /** Link references and attach popovers; off inside popovers. Default `true`. */
  links?: boolean;
}

const unwrapParagraph = ({ children }: { children?: ReactNode }) => (
  <>{children}</>
);

function pagesByKey(): Set<string> {
  return new Set(listSymbolPages().map((p) => `${p.pkg}/${p.symbol}`));
}

/** The members whose docs and excerpts a symbol page renders. */
function renderedMembers(summary: ApiSymbol): ApiMember[] {
  if (summary.kind === 'Namespace') {
    return [];
  }
  return summary.members.flatMap((member) => [member, ...methodsOf(member)]);
}

function collectMarkdown(summary: ApiSymbol) {
  const members = renderedMembers(summary);
  return {
    block: [
      ...new Set(
        members.flatMap((m) => [
          m.docs.summary,
          m.docs.usageNotes,
          ...m.docs.examples,
        ]),
      ),
    ].filter(Boolean),
    inline: [
      ...new Set(
        members.flatMap((m) => m.docs.params.map((p) => p.description)),
      ),
    ].filter(Boolean),
  };
}

function collectReferences(summary: ApiSymbol, sources: string[]): string[] {
  const members = summary.members.flatMap((m) => [m, ...(m.members ?? [])]);
  const fromTokens = members.flatMap((m) =>
    [...m.excerptTokens, ...(m.overlayTokens ?? [])].flatMap((t) =>
      t.kind === 'Reference' && t.canonicalReference
        ? [t.canonicalReference]
        : [],
    ),
  );
  const fromMarkdown = sources.flatMap(
    (source) => source.match(CANONICAL_REFERENCE_PATTERN) ?? [],
  );
  return [...new Set([...fromTokens, ...fromMarkdown])];
}

function internalHref(reference: string, served: Set<string>) {
  const parsed = parseCanonicalReference(reference);
  const href = parsed ? symbolHref(parsed) : undefined;
  if (!href) {
    return undefined;
  }
  if (href.startsWith('http')) {
    return { href, external: true };
  }
  const [, , pkg, ...rest] = href.split('/');
  return served.has(`${pkg}/${rest.join('/')}`)
    ? { href, external: false }
    : undefined;
}

const popoverCache = new Map<string, Promise<ReactNode | undefined>>();

function popoverFor(reference: string): Promise<ReactNode | undefined> {
  const cached = popoverCache.get(reference);
  if (cached) {
    return cached;
  }
  const popover = (async () => {
    const summary = loadFromCanonicalReference(reference);
    if (!summary?.members.length) {
      return undefined;
    }
    const pkg = parseCanonicalReference(reference)?.package.split('/')[1] ?? '';
    const context = await buildSymbolContext(summary, pkg, { links: false });
    return <SymbolPopoverContent summary={summary} context={context} />;
  })();
  popoverCache.set(reference, popover);
  return popover;
}

async function renderAll(
  sources: string[],
  components: MarkdownComponents,
): Promise<Map<string, ReactNode>> {
  const rendered = await Promise.all(
    sources.map(
      async (source) =>
        [source, (await renderMarkdown(source, components)).content] as const,
    ),
  );
  return new Map(rendered);
}

/**
 * Prepare a symbol page (or popover) for rendering: load the highlighter,
 * render every doc string the page shows, and resolve each referenced symbol
 * to a link and a pre-rendered popover. Popovers are built once per reference
 * and reused, so each page ships only data for the symbols it mentions.
 *
 * @param summary - The symbol to render.
 * @param pkg - Its package directory, e.g. `react`; picks the docs SDK for links.
 * @param options - `links: false` renders references as plain text (popovers).
 */
export async function buildSymbolContext(
  summary: ApiSymbol,
  pkg: string,
  { links = true }: BuildSymbolContextOptions = {},
): Promise<SymbolRenderContext> {
  const highlight = await createExcerptHighlighter();
  const sources = collectMarkdown(summary);
  const served = pagesByKey();
  const references = links
    ? collectReferences(summary, [...sources.block, ...sources.inline])
    : [];
  const targets = new Map(
    await Promise.all(
      references.flatMap((reference) => {
        const target = internalHref(reference, served);
        if (!target) {
          return [];
        }
        return [
          (async () =>
            [
              reference,
              {
                ...target,
                popover: target.external
                  ? undefined
                  : await popoverFor(reference),
              },
            ] as const)(),
        ];
      }),
    ),
  );

  const base = docsComponents(pkg === 'angular' ? 'angular' : 'react');
  const components: MarkdownComponents = links
    ? {
        ...base,
        'hb-symbol-link': ({ reference = '' }: { reference?: string }) => {
          const popover = targets.get(reference)?.popover;
          const link = <SymbolLink reference={reference} />;
          return popover ? (
            <SymbolPopover reference={reference} content={popover}>
              {link}
            </SymbolPopover>
          ) : (
            link
          );
        },
      }
    : base;
  const [block, inline] = await Promise.all([
    renderAll(sources.block, components),
    renderAll(sources.inline, { ...components, p: unwrapParagraph }),
  ]);

  return {
    highlight,
    markdown: (source) => block.get(source) ?? null,
    inlineMarkdown: (source) => inline.get(source) ?? null,
    linkTarget: (reference) => targets.get(reference),
  };
}
