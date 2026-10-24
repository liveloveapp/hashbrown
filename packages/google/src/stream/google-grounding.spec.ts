import {
  addGoogleToolSources,
  createGoogleGroundingState,
  foldGoogleGrounding,
  foldGoogleSearchSuggestions,
} from './google-grounding';

test('folds call-less metadata into stable answer sources and quote-only citations', () => {
  const state = createGoogleGroundingState('response');
  const metadata = {
    groundingChunks: [{ web: { uri: 'https://one.test', title: 'One' } }],
    groundingSupports: [
      {
        groundingChunkIndices: [0, -1, 9, 0.5],
        segment: { text: 'é🌱', partIndex: 4, startIndex: 10, endIndex: 16 },
      },
    ],
  };

  const result = foldGoogleGrounding(state, metadata);

  expect(result.annotations).toEqual({
    v: 1,
    sources: [
      {
        id: 'response:source:0',
        kind: 'url',
        href: 'https://one.test',
        title: 'One',
      },
    ],
    citations: [{ sourceId: 'response:source:0', quote: 'é🌱' }],
  });
  expect(foldGoogleGrounding(state, undefined).annotations).toEqual({ v: 1 });
});

test('appends duplicate grounding entries as index aliases while deduplicating public URLs', () => {
  const initial = foldGoogleGrounding(createGoogleGroundingState('r'), {
    groundingChunks: [{ web: { uri: 'https://one.test' } }],
  });

  const duplicate = foldGoogleGrounding(initial.state, {
    groundingChunks: [
      { web: { uri: 'https://one.test' } },
      { web: { uri: 'https://two.test' } },
    ],
    groundingSupports: [
      { groundingChunkIndices: [1, 2], segment: { text: 'Both' } },
    ],
  });
  const repeated = foldGoogleGrounding(duplicate.state, {
    groundingSupports: [
      { groundingChunkIndices: [2], segment: { text: 'Both' } },
    ],
  });

  expect(repeated.annotations.sources?.map((source) => source.href)).toEqual([
    'https://one.test',
    'https://two.test',
  ]);
  expect(repeated.annotations.citations).toEqual([
    { sourceId: 'r:source:0', quote: 'Both' },
    { sourceId: 'r:source:1', quote: 'Both' },
    { sourceId: 'r:source:1', quote: 'Both' },
  ]);
  expect(initial.annotations.citations).toBeUndefined();
});

test('resolves late sources without assigning invalid and unsupported indices to unrelated URLs', () => {
  const initial = foldGoogleGrounding(createGoogleGroundingState('r'), {
    groundingSupports: [
      { groundingChunkIndices: [0, 1, 2], segment: { text: 'Late' } },
    ],
  });

  const result = foldGoogleGrounding(initial.state, {
    groundingChunks: [
      { maps: { uri: 'https://maps.test' } },
      {
        image: {
          sourceUri: 'https://image.test',
          imageUri: 'https://pixels.test',
          title: 'Image',
        },
      },
    ],
  });

  expect(initial.annotations).toEqual({ v: 1 });
  expect(result.annotations.sources).toEqual([
    {
      id: 'r:source:0',
      kind: 'url',
      href: 'https://image.test',
      title: 'Image',
    },
  ]);
  expect(result.annotations.citations).toEqual([
    { sourceId: 'r:source:0', quote: 'Late' },
  ]);
});

test('reuses only explicitly proven tool source identities and keeps those sources off the answer', () => {
  const toolSource = Object.freeze({
    id: 'call:source:0',
    kind: 'url' as const,
    href: 'https://one.test',
    title: 'Tool One',
  });
  const initial = foldGoogleGrounding(createGoogleGroundingState('r'), {
    groundingChunks: [
      { web: { uri: 'https://one.test' } },
      { web: { uri: 'https://two.test' } },
    ],
    groundingSupports: [
      { groundingChunkIndices: [0, 1], segment: { text: 'Answer' } },
    ],
  });

  const state = addGoogleToolSources(initial.state, [toolSource]);
  const result = foldGoogleGrounding(state, undefined);

  expect(result.annotations.sources?.map((source) => source.href)).toEqual([
    'https://two.test',
  ]);
  expect(
    result.annotations.citations?.map((citation) => citation.sourceId),
  ).toEqual(['call:source:0', 'r:source:1']);
  expect(initial.annotations.sources).toHaveLength(2);
});

test('accepts successful URL context sources without inventing sources for retrieval failures', () => {
  const metadata = Object.freeze({
    urlMetadata: Object.freeze([
      Object.freeze({
        retrievedUrl: 'https://ok.test',
        urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS',
      }),
      Object.freeze({
        retrievedUrl: 'https://failed.test',
        urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_ERROR',
      }),
      Object.freeze({ retrievedUrl: 'https://unknown.test' }),
    ]),
  });

  const result = foldGoogleGrounding(
    createGoogleGroundingState('r'),
    undefined,
    metadata,
  );

  expect(result.annotations.sources).toEqual([
    {
      id: 'r:source:0',
      kind: 'url',
      href: 'https://ok.test',
      title: 'https://ok.test',
    },
  ]);
});

test('preserves exact required Search Suggestions widgets and deduplicates only identical HTML', () => {
  const html =
    '<style> a { color: red } </style>\n<a href="https://one.test?q=x&y=z">é</a>';
  const initial = foldGoogleGrounding(createGoogleGroundingState('r'), {
    searchEntryPoint: { renderedContent: html },
  });

  const duplicate = foldGoogleSearchSuggestions(initial.state, {
    search_suggestions: html,
  });
  const distinct = foldGoogleSearchSuggestions(duplicate.state, {
    search_suggestions: { renderedContent: `${html} ` },
  });

  expect(distinct.annotations.attribution).toEqual([
    { provider: 'google', kind: 'search-suggestions', html, mustRender: true },
    {
      provider: 'google',
      kind: 'search-suggestions',
      html: `${html} `,
      mustRender: true,
    },
  ]);
  expect(initial.annotations.attribution).toHaveLength(1);
});

test('owns returned annotation objects and ignores malformed metadata', () => {
  const initial = foldGoogleGrounding(createGoogleGroundingState('r'), {
    groundingChunks: [{ web: { uri: 'https://one.test' } }, null],
    groundingSupports: [
      null,
      { groundingChunkIndices: [0], segment: { text: 'One' } },
    ],
  });
  const source = initial.annotations.sources?.[0];
  const citation = initial.annotations.citations?.[0];
  if (!source || !citation) {
    throw new Error(
      'Expected a source and citation to verify annotation ownership',
    );
  }
  source.title = 'Changed';
  citation.quote = 'Changed';

  const result = foldGoogleGrounding(initial.state, {
    groundingChunks: 'invalid',
    groundingSupports: {},
  });

  expect(result.annotations.sources?.[0].title).toBe('https://one.test');
  expect(result.annotations.citations?.[0].quote).toBe('One');
  expect(
    foldGoogleSearchSuggestions(result.state, {
      search_suggestions: { html: '<unrecognized>' },
    }).annotations,
  ).toEqual(result.annotations);
});

test('folds frozen inputs after tool ownership is already established', () => {
  const source = Object.freeze({
    id: 'call:source:0',
    kind: 'url' as const,
    href: 'https://one.test',
    title: 'One',
  });
  const initial = addGoogleToolSources(
    Object.freeze(createGoogleGroundingState('r')),
    Object.freeze([source]),
  );
  const metadata = Object.freeze({
    groundingChunks: Object.freeze([
      Object.freeze({ web: Object.freeze({ uri: source.href }) }),
    ]),
    groundingSupports: Object.freeze([
      Object.freeze({
        groundingChunkIndices: Object.freeze([0]),
        segment: Object.freeze({ text: 'One' }),
      }),
    ]),
  });

  const result = foldGoogleGrounding(Object.freeze(initial), metadata);

  expect(result.annotations).toEqual({
    v: 1,
    citations: [{ sourceId: source.id, quote: 'One' }],
  });
  expect(initial.references).toEqual([]);
  expect(addGoogleToolSources(result.state, undefined)).toEqual(result.state);
});
