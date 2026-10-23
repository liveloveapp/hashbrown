import {
  addAnthropicToolSources,
  createAnthropicSourceContext,
  resolveAnthropicCitation,
} from './anthropic-sources';

test('matches the nearest preceding URL source and keeps citation coordinates out of answer spans', () => {
  const initial = createAnthropicSourceContext(
    undefined,
    undefined,
    'response',
  );
  const first = addAnthropicToolSources(
    initial,
    [
      {
        id: 'first:0',
        kind: 'url',
        title: 'Page',
        href: 'https://example.test/page?utm_source=a',
      },
    ],
    0,
  );
  const later = addAnthropicToolSources(
    first,
    [
      {
        id: 'later:0',
        kind: 'url',
        title: 'Page',
        href: 'https://example.test/page',
      },
    ],
    4,
  );

  const result = resolveAnthropicCitation(
    later,
    {
      type: 'web_search_result_location',
      url: 'https://example.test/page',
      title: null,
      cited_text: 'quoted',
      encrypted_index: 'opaque',
      start_char_index: 8,
      end_char_index: 12,
    },
    2,
  );

  expect(result.annotations).toEqual({
    v: 1,
    citations: [{ sourceId: 'first:0', quote: 'quoted' }],
  });
  expect(initial.entries).toHaveLength(0);
});

test('keeps app search-result and document index collections separate from server search results', () => {
  const request = {
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'search_result',
            title: 'App page',
            source: 'https://app.test',
            content: [{ type: 'text', text: 'app' }],
          },
          {
            type: 'document',
            title: 'Document',
            source: {
              type: 'text',
              media_type: 'text/plain',
              data: 'document',
            },
          },
        ],
      },
    ],
  };
  const initial = createAnthropicSourceContext(request, undefined, 'response');
  const tools = addAnthropicToolSources(
    initial,
    [
      {
        id: 'server:0',
        kind: 'url',
        title: 'Server',
        href: 'https://server.test',
      },
    ],
    0,
  );

  const app = resolveAnthropicCitation(
    tools,
    {
      type: 'search_result_location',
      search_result_index: 0,
      title: 'App page',
      source: 'https://app.test',
      cited_text: 'app',
    },
    1,
  );
  const doc = resolveAnthropicCitation(
    app.context,
    {
      type: 'char_location',
      document_index: 0,
      document_title: 'Document',
      cited_text: 'document',
      start_char_index: 0,
      end_char_index: 8,
    },
    1,
  );

  expect(app.annotations?.citations?.[0].sourceId).toBe(
    'response:input-search:0',
  );
  expect(doc.annotations?.citations?.[1].sourceId).toBe(
    'response:input-document:0',
  );
  expect(doc.annotations?.sources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'response:input-search:0',
        href: 'https://app.test',
      }),
      expect.objectContaining({
        id: 'response:input-document:0',
        kind: 'document',
      }),
    ]),
  );
});

test('creates stable answer-only sources for unmatched citations and preserves repeated quotes', () => {
  const initial = createAnthropicSourceContext(
    undefined,
    undefined,
    'response',
  );
  const citation = {
    type: 'web_search_result_location',
    url: 'https://missing.test',
    title: null,
    cited_text: 'quote',
    encrypted_index: 'opaque',
  };

  const first = resolveAnthropicCitation(initial, citation, 1);
  const second = resolveAnthropicCitation(first.context, citation, 1);

  expect(second.annotations).toEqual({
    v: 1,
    citations: [
      { sourceId: 'response:source:0', quote: 'quote' },
      { sourceId: 'response:source:0', quote: 'quote' },
    ],
    sources: [
      {
        id: 'response:source:0',
        kind: 'url',
        title: 'https://missing.test',
        href: 'https://missing.test',
      },
    ],
  });
});

test('recovers prior native tool sources without requiring display metadata', () => {
  const request = {
    messages: [
      {
        role: 'assistant',
        content: [
          {
            type: 'server_tool_use',
            id: 'prior',
            name: 'web_search',
            input: { query: 'weather' },
          },
          {
            type: 'web_search_tool_result',
            tool_use_id: 'prior',
            content: [
              {
                type: 'web_search_result',
                title: 'Prior',
                url: 'https://prior.test',
                encrypted_content: 'opaque',
              },
            ],
          },
        ],
      },
    ],
  };

  const initial = createAnthropicSourceContext(request, undefined, 'response');
  const result = resolveAnthropicCitation(
    initial,
    {
      type: 'web_search_result_location',
      url: 'https://prior.test',
      title: 'Prior',
      cited_text: 'prior quote',
    },
    0,
  );

  expect(result.annotations).toEqual({
    v: 1,
    citations: [{ sourceId: 'prior:0', quote: 'prior quote' }],
  });
});

test.each([
  {
    type: 'char_location',
    document_index: 9,
    document_title: null,
    cited_text: 'document',
  },
  {
    type: 'page_location',
    file_id: 'file',
    document_index: 9,
    document_title: null,
    cited_text: 'file',
  },
  {
    type: 'search_result_location',
    search_result_index: 9,
    title: null,
    source: 'https://app.test',
    cited_text: 'app',
  },
])(
  'deduplicates unresolved source identity while retaining citation occurrences %#',
  (citation) => {
    const initial = createAnthropicSourceContext(
      undefined,
      undefined,
      'response',
    );

    const first = resolveAnthropicCitation(initial, citation, 1);
    const second = resolveAnthropicCitation(first.context, citation, 2);

    expect(second.annotations?.sources).toHaveLength(1);
    expect(second.annotations?.citations).toEqual([
      { sourceId: 'response:source:0', quote: citation.cited_text },
      { sourceId: 'response:source:0', quote: citation.cited_text },
    ]);
  },
);

test('resolves repeated historical URLs against the latest preceding native result', () => {
  const content = ['old', 'new'].flatMap((id) => [
    { type: 'server_tool_use', id, name: 'web_search', input: {} },
    {
      type: 'web_search_tool_result',
      tool_use_id: id,
      content: [
        {
          type: 'web_search_result',
          title: id,
          url: 'https://same.test',
          encrypted_content: 'opaque',
        },
      ],
    },
  ]);
  const initial = createAnthropicSourceContext(
    { messages: [{ role: 'assistant', content }] },
    undefined,
    'response',
  );

  const result = resolveAnthropicCitation(
    initial,
    {
      type: 'web_search_result_location',
      url: 'https://same.test',
      title: null,
      cited_text: 'new',
    },
    0,
  );

  expect(result.annotations?.citations).toEqual([
    { sourceId: 'new:0', quote: 'new' },
  ]);
});

test('a newly available tool source takes precedence over an earlier unresolved citation source', () => {
  const citation = {
    type: 'web_search_result_location',
    url: 'https://same.test',
    title: null,
    cited_text: 'quote',
  };
  const first = resolveAnthropicCitation(
    createAnthropicSourceContext(undefined, undefined, 'response'),
    citation,
    0,
  );
  const collected = addAnthropicToolSources(
    first.context,
    [{ id: 'tool:0', kind: 'url', title: 'Page', href: 'https://same.test' }],
    1,
  );

  const later = resolveAnthropicCitation(collected, citation, 2);

  expect(later.annotations?.citations).toEqual([
    { sourceId: 'response:source:0', quote: 'quote' },
    { sourceId: 'tool:0', quote: 'quote' },
  ]);
});
