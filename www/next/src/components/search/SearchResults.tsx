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
  description: 'Show a documentation search result to the user',
  props: {
    url: s.string('The url of the documentation search result.'),
    title: s.string('The title of the documentation search result.'),
    subtitle: s.string(
      'The subtitle or description. Leave empty if not applicable.',
    ),
  },
});

const apiResult = exposeComponent(ApiResult, {
  name: 'www-api-result',
  description: 'Show a API reference search result to the user',
  props: {
    url: s.string('The url of the API reference search result.'),
    symbol: s.string('The API reference symbol.'),
    kind: s.string('The API reference kind.'),
    package: s.string('The API reference package.'),
  },
});

/**
 * The components the search model may render, named after the Angular
 * selectors the system prompt's examples use.
 */
export const SEARCH_RESULT_COMPONENTS = [
  exposeComponent(DocResults, {
    name: 'www-doc-results',
    description: 'Show documentation search results to the user',
    children: [docResult],
  }),
  docResult,
  exposeComponent(ApiResults, {
    name: 'www-api-results',
    description: 'Show API reference search results to the user',
    children: [apiResult],
  }),
  apiResult,
  exposeComponent(SearchMarkdown, {
    name: 'www-markdown',
    description: 'Show a message to the user using simple markdown',
    props: {
      content: s.streaming.string('The markdown content'),
    },
  }),
];
