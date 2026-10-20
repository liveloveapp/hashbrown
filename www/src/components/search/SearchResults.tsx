'use client';

import { s } from '@hashbrownai/core';
import { exposeComponent, MagicTextRenderer } from '@hashbrownai/react';
import Link from 'next/link';
import { createContext, type ReactNode, useContext } from 'react';
import { FileCodeIcon, FileIcon } from '../site/icons';
import styles from './SearchOverlay.module.css';

/** What rendered search results need from the overlay around them. */
export interface SearchOverlayContextValue {
  /** Close the overlay, e.g. when a result link is followed. */
  close: () => void;
  /** Whether the model is still answering. */
  isLoading: boolean;
}

/**
 * Lets the components the model renders close the overlay. Replaces the
 * Angular results' `hashbrown:search-overlay:close` window event.
 */
export const SearchOverlayContext = createContext<SearchOverlayContextValue>({
  close: () => undefined,
  isLoading: false,
});

/** `<www-doc-results>`: the "DOCS" group of search results. */
export function DocResults({ children }: { children?: ReactNode }) {
  return (
    <div className={styles.results}>
      <p>DOCS</p>
      {children}
    </div>
  );
}

/** `<www-doc-result>`: a link to one docs page. */
export function DocResult({
  url,
  title,
  subtitle,
}: {
  url: string;
  title: string;
  /** Empty when the page has no description. */
  subtitle: string;
}) {
  const { close } = useContext(SearchOverlayContext);

  return (
    <Link href={url} className={styles.result} onClick={close}>
      <div>
        <FileIcon />
      </div>
      <div>
        {title}
        {subtitle && <span>{subtitle}</span>}
      </div>
    </Link>
  );
}

/** `<www-api-results>`: the "API REFERENCES" group of search results. */
export function ApiResults({ children }: { children?: ReactNode }) {
  return (
    <div className={styles.results}>
      <p>API REFERENCES</p>
      {children}
    </div>
  );
}

/** `<www-api-result>`: a link to one API symbol, with its package and kind. */
export function ApiResult({
  url,
  symbol,
  kind,
  package: npmPackage,
}: {
  url: string;
  symbol: string;
  kind: string;
  package: string;
}) {
  const { close } = useContext(SearchOverlayContext);

  return (
    <Link
      href={url}
      className={`${styles.result} ${styles.apiResult}`}
      onClick={close}
    >
      <div>
        <FileCodeIcon />
      </div>
      <div>
        <div className={styles.symbol}>
          <span>{symbol}</span>
          <span className={styles.package}>{npmPackage}</span>
        </div>
        {kind && <div className={styles.kind}>{kind}</div>}
      </div>
    </Link>
  );
}

/**
 * `<www-markdown>`: a short markdown message, such as "no results" or a
 * polite refusal, rendered as it streams.
 */
export function SearchMarkdown({ content }: { content: string }) {
  const { isLoading } = useContext(SearchOverlayContext);

  return (
    <MagicTextRenderer className={styles.markdown} isComplete={!isLoading}>
      {content}
    </MagicTextRenderer>
  );
}

const docResult = exposeComponent(DocResult, {
  name: 'www-doc-result',
  description:
    'One documentation page in the search results. Use it only inside www-doc-results, once per page. For an API symbol use www-api-result instead.',
  props: {
    url: s.string(
      'The page url exactly as the url column of the sitemap shows it, such as /docs/react/concept/components.',
    ),
    title: s.string("The page's title from the sitemap's title column."),
    subtitle: s.string(
      "The page's description from the sitemap's description column. An empty string when the sitemap has none.",
    ),
  },
});

const apiResult = exposeComponent(ApiResult, {
  name: 'www-api-result',
  description:
    'One API symbol in the search results. Use it only inside www-api-results, once per symbol. For a documentation page use www-doc-result instead.',
  props: {
    url: s.string(
      'The symbol url exactly as the url column of the API references shows it, such as /api/react/useUiChat.',
    ),
    symbol: s.string(
      'The symbol name from the symbol column, such as useUiChat.',
    ),
    kind: s.string(
      'The symbol kind from the kind column, such as Function or Interface.',
    ),
    package: s.string(
      'The npm package from the package column, such as @hashbrownai/react.',
    ),
  },
});

/**
 * The components the search model may render, named after the Angular
 * selectors of the original overlay. Their descriptions tell the model when
 * to use each one; `searchSystemPrompt` holds the ranking and layout rules.
 */
export const SEARCH_RESULT_COMPONENTS = [
  exposeComponent(DocResults, {
    name: 'www-doc-results',
    description:
      'The group of documentation page results. Its children are only www-doc-result entries, at most 8, most relevant first. Use it once per answer, and only when at least one documentation page matches. API symbols go in www-api-results instead.',
    children: [docResult],
  }),
  docResult,
  exposeComponent(ApiResults, {
    name: 'www-api-results',
    description:
      'The group of API reference results. Its children are only www-api-result entries, at most 8, most relevant first. Use it once per answer, and only when at least one API symbol matches. Documentation pages go in www-doc-results instead.',
    children: [apiResult],
  }),
  apiResult,
  exposeComponent(SearchMarkdown, {
    name: 'www-markdown',
    description:
      'A short markdown message instead of results: a kind refusal when the query is not about hashbrown, or a note that nothing matched. Use it as the only component in the answer. Never use it to list results; use www-doc-results and www-api-results for those.',
    props: {
      content: s.streaming.string(
        'The message in simple markdown, one or two sentences.',
      ),
    },
  }),
];
