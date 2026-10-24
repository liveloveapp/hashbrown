import {
  addBedrockToolSources,
  createBedrockAnnotationState,
  foldBedrockCitation,
} from './bedrock-annotations';

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected answer sources');
  return value;
}

const citation = {
  title: 'Weather',
  source: 'opaque source',
  sourceContent: [{ text: 'A quote' }],
  location: {
    web: { url: 'https://weather.example', domain: 'weather.example' },
  },
};

test('call-less citations create answer sources with quotes and no answer offsets', () => {
  const initial = createBedrockAnnotationState('response');

  const first = foldBedrockCitation(initial, citation);
  const second = foldBedrockCitation(first.state, citation);

  expect(first.annotations.sources).toEqual([
    {
      id: 'response:answer-source:0',
      kind: 'url',
      title: 'Weather',
      href: 'https://weather.example',
    },
  ]);
  expect(second.annotations.sources).toHaveLength(1);
  expect(second.annotations.citations).toEqual([
    { sourceId: 'response:answer-source:0', quote: 'A quote' },
    { sourceId: 'response:answer-source:0', quote: 'A quote' },
  ]);
  expect(initial.citations).toEqual([]);
});

test('explicit source URL works without web location and ordinary strings do not', () => {
  const initial = createBedrockAnnotationState('response');

  const good = foldBedrockCitation(initial, {
    source: 'https://explicit.example',
    title: 'Explicit',
  });
  const bad = foldBedrockCitation(good.state, {
    source: 'plain prose',
    location: { web: { url: 'javascript:bad', domain: 'fake.example' } },
  });

  expect(good.annotations.sources?.[0].href).toBe('https://explicit.example');
  expect(bad.annotations.sources).toHaveLength(1);
  expect(bad.annotations.citations).toHaveLength(1);
});

test('only exact proven tool source URLs establish tool ownership including late sources', () => {
  const initial = createBedrockAnnotationState('response');
  const first = foldBedrockCitation(initial, citation);
  const second = foldBedrockCitation(first.state, citation);
  const toolSource = {
    id: 'tool:source:0',
    kind: 'url' as const,
    title: 'Tool source',
    href: 'https://weather.example',
  };

  const remapped = addBedrockToolSources(second.state, [toolSource]);
  const unrelated = addBedrockToolSources(initial, [
    { ...toolSource, href: 'https://weather.example/other' },
  ]);
  const ordinary = foldBedrockCitation(unrelated.state, citation);

  expect(remapped.annotations.sources).toEqual([]);
  expect(remapped.annotations.citations).toEqual([
    { sourceId: toolSource.id, quote: 'A quote' },
    { sourceId: toolSource.id, quote: 'A quote' },
  ]);
  expect(ordinary.annotations.sources).toHaveLength(1);
  expect(first.annotations.citations?.[0].sourceId).toBe(
    'response:answer-source:0',
  );
});

test.each(['documentChar', 'documentPage', 'documentChunk'])(
  'valid %s references create readable document sources',
  (kind) => {
    const initial = createBedrockAnnotationState('response');

    const folded = foldBedrockCitation(initial, {
      title: 'Manual',
      sourceContent: [{ text: 'First' }, { text: ' second' }],
      location: { [kind]: { documentIndex: 2, start: 4, end: 9 } },
    });

    expect(folded.annotations.sources?.[0]).toMatchObject({
      kind: 'document',
      title: 'Manual',
    });
    expect(folded.annotations.citations?.[0]).toEqual({
      sourceId: 'response:answer-source:0',
      quote: 'First second',
    });
  },
);

test('unusable document and unproven search-result indices never invent source references', () => {
  const initial = createBedrockAnnotationState('response');

  const document = foldBedrockCitation(initial, {
    title: 'No reference',
    location: { documentChar: { start: 2, end: 5 } },
  });
  const search = foldBedrockCitation(document.state, {
    location: {
      searchResultLocation: { searchResultIndex: 0, start: 2, end: 5 },
    },
  });

  expect(search.annotations.sources).toEqual([]);
  expect(search.annotations.citations).toEqual([]);
});

test('annotation state and returned annotations own their mutable descendants', () => {
  const initial = createBedrockAnnotationState('response');
  const delta = structuredClone(citation);

  const folded = foldBedrockCitation(initial, delta);
  delta.sourceContent[0].text = 'changed';
  required(folded.annotations.sources)[0].title = 'changed';
  const next = foldBedrockCitation(folded.state, citation);

  expect(next.annotations.sources?.[0].title).toBe('Weather');
  expect(next.annotations.citations?.[0].quote).toBe('A quote');
});

test('answer and tool source namespaces cannot collide when their owner IDs match', () => {
  const initial = createBedrockAnnotationState('call');
  const tool = addBedrockToolSources(initial, [
    {
      id: 'call:source:0',
      kind: 'url',
      title: 'Other',
      href: 'https://other.example',
    },
  ]);

  const folded = foldBedrockCitation(tool.state, citation);

  expect(folded.annotations.sources?.[0].id).toBe('call:answer-source:0');
});
