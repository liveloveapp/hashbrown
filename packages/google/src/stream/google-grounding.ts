import type { ɵAnswerAnnotations, ɵToolStepSource } from '@hashbrownai/core';

type GroundingSupport = {
  readonly indices: readonly number[];
  readonly quote?: string;
};

/** Immutable response-wide grounding references and answer annotations. */
export interface GoogleGroundingState {
  readonly responseId: string;
  readonly references: readonly (string | undefined)[];
  readonly sources: readonly Readonly<ɵToolStepSource>[];
  readonly toolSources: readonly Readonly<ɵToolStepSource>[];
  readonly supports: readonly GroundingSupport[];
  readonly widgets: readonly string[];
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Starts an empty response-wide grounding accumulator. */
export function createGoogleGroundingState(
  responseId: string,
): GoogleGroundingState {
  return {
    responseId,
    references: [],
    sources: [],
    toolSources: [],
    supports: [],
    widgets: [],
  };
}

/** Records sources whose tool ownership is explicitly established. */
export function addGoogleToolSources(
  state: GoogleGroundingState,
  sources: readonly ɵToolStepSource[] | undefined,
): GoogleGroundingState {
  const toolSources = [...state.toolSources];
  for (const source of sources ?? []) {
    if (
      source.kind === 'url' &&
      source.href &&
      !toolSources.some((existing) => existing.href === source.href)
    ) {
      toolSources.push({ ...source });
    }
  }
  return { ...state, toolSources };
}

function annotations(state: GoogleGroundingState): ɵAnswerAnnotations {
  const sourceForUrl = (href: string) =>
    state.toolSources.find((source) => source.href === href) ??
    state.sources.find((source) => source.href === href);
  const citations = state.supports.flatMap((support) =>
    support.indices.flatMap((index) => {
      const href = state.references[index];
      const source = href === undefined ? undefined : sourceForUrl(href);
      return source
        ? [
            {
              sourceId: source.id,
              ...(support.quote === undefined ? {} : { quote: support.quote }),
            },
          ]
        : [];
    }),
  );
  const sources = state.sources
    .filter(
      (source) => !state.toolSources.some((tool) => tool.href === source.href),
    )
    .map((source) => ({ ...source }));
  const attribution: NonNullable<ɵAnswerAnnotations['attribution']> =
    state.widgets.map((html) => ({
      provider: 'google',
      kind: 'search-suggestions',
      html,
      mustRender: true,
    }));
  return {
    v: 1,
    ...(sources.length ? { sources } : {}),
    ...(citations.length ? { citations } : {}),
    ...(attribution.length ? { attribution } : {}),
  };
}

function addSource(
  state: GoogleGroundingState,
  href: string | undefined,
  title?: string,
): GoogleGroundingState {
  if (!href || state.sources.some((source) => source.href === href)) {
    return state;
  }
  return {
    ...state,
    sources: [
      ...state.sources,
      {
        id: `${state.responseId}:source:${state.sources.length}`,
        kind: 'url',
        href,
        title: title ?? href,
      },
    ],
  };
}

function addWidget(
  state: GoogleGroundingState,
  html: string | undefined,
): GoogleGroundingState {
  return html === undefined || state.widgets.includes(html)
    ? state
    : { ...state, widgets: [...state.widgets, html] };
}

/**
 * Folds grounding deltas independently of content or native tool calls.
 * Every chunk occupies a reference index, including duplicate and unsupported
 * entries. Citations use segment text because native offsets measure Part bytes.
 */
export function foldGoogleGrounding(
  state: GoogleGroundingState,
  groundingMetadata: unknown,
  urlContextMetadata?: unknown,
): { state: GoogleGroundingState; annotations: ɵAnswerAnnotations } {
  const metadata = record(groundingMetadata);
  let next = state;
  for (const entry of list(metadata['groundingChunks'])) {
    const chunk = record(entry);
    const web = record(chunk['web']);
    const image = record(chunk['image']);
    const href =
      string(web['uri']) ??
      string(image['sourceUri']) ??
      string(image['imageUri']);
    next = addSource(
      next,
      href,
      string(web['title']) ?? string(image['title']),
    );
    next = { ...next, references: [...next.references, href] };
  }
  const supports = list(metadata['groundingSupports']).flatMap((entry) => {
    const support = record(entry);
    const indices = list(support['groundingChunkIndices']).filter(
      (index): index is number =>
        typeof index === 'number' && Number.isInteger(index) && index >= 0,
    );
    const quote = string(record(support['segment'])['text']);
    return indices.length
      ? [{ indices, ...(quote === undefined ? {} : { quote }) }]
      : [];
  });
  next = { ...next, supports: [...next.supports, ...supports] };
  for (const entry of list(record(urlContextMetadata)['urlMetadata'])) {
    const url = record(entry);
    if (url['urlRetrievalStatus'] === 'URL_RETRIEVAL_STATUS_SUCCESS') {
      next = addSource(next, string(url['retrievedUrl']));
    }
  }
  next = addWidget(
    next,
    string(record(metadata['searchEntryPoint'])['renderedContent']),
  );
  return { state: next, annotations: annotations(next) };
}

/** Preserves native search suggestion HTML as required answer attribution. */
export function foldGoogleSearchSuggestions(
  state: GoogleGroundingState,
  responsePayload: unknown,
): { state: GoogleGroundingState; annotations: ɵAnswerAnnotations } {
  const suggestions = record(responsePayload)['search_suggestions'];
  const next = addWidget(
    state,
    string(suggestions) ?? string(record(suggestions)['renderedContent']),
  );
  return { state: next, annotations: annotations(next) };
}
