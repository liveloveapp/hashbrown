import type { ɵAnswerAnnotations, ɵToolStepSource } from '@hashbrownai/core';
import {
  type AnthropicServerToolCall,
  readAnthropicServerToolCall,
  readAnthropicServerToolResult,
} from './anthropic-tools';

interface SourceEntry {
  readonly source: ɵToolStepSource;
  readonly position: number;
}

/** Immutable citation lookup collections with native input indices kept separate. @internal */
export interface AnthropicSourceContext {
  readonly responseId: string;
  readonly entries: readonly SourceEntry[];
  readonly searchResults: readonly ɵToolStepSource[];
  readonly documents: readonly ɵToolStepSource[];
  readonly answerSources: readonly ɵToolStepSource[];
  readonly answerIdentities: Readonly<Record<string, string>>;
  readonly citations: NonNullable<ɵAnswerAnnotations['citations']>;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function title(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function urlKey(value: string): string {
  try {
    const url = new URL(value);
    url.searchParams.delete('utm_source');
    return url.href;
  } catch {
    return value;
  }
}

/** Builds lookup collections from the actual native request and canonical source metadata. @internal */
export function createAnthropicSourceContext(
  requestOptions: unknown,
  inputMessages: unknown,
  responseId: string,
): AnthropicSourceContext {
  const entries: SourceEntry[] = [];
  const searchResults: ɵToolStepSource[] = [];
  const documents: ɵToolStepSource[] = [];
  const calls = new Map<string, AnthropicServerToolCall>();
  const visit = (blocks: unknown) => {
    if (!Array.isArray(blocks)) return;
    for (const block of blocks) {
      if (!record(block)) continue;
      const call = readAnthropicServerToolCall(block);
      if (call) calls.set(call.id, call);
      const priorCall =
        typeof block['tool_use_id'] === 'string'
          ? calls.get(block['tool_use_id'])
          : undefined;
      const result = priorCall
        ? readAnthropicServerToolResult(priorCall, block, 0)
        : undefined;
      for (const source of result?.step.sources ?? [])
        entries.push({ source, position: -1 });
      if (
        block['type'] === 'web_fetch_tool_result' &&
        result?.step.sources?.[0]
      )
        documents.push(result.step.sources[0]);
      if (
        block['type'] === 'search_result' &&
        typeof block['source'] === 'string'
      ) {
        searchResults.push({
          id: `${responseId}:input-search:${searchResults.length}`,
          kind: 'url',
          title: title(block['title'], block['source']),
          href: block['source'],
        });
      }
      if (block['type'] === 'document') {
        const source = block['source'];
        const fileId =
          record(source) && typeof source['file_id'] === 'string'
            ? source['file_id']
            : undefined;
        documents.push({
          id: `${responseId}:input-document:${documents.length}`,
          kind: 'document',
          title: title(block['title'], `Document ${documents.length + 1}`),
          ...(fileId ? { fileId } : {}),
        });
      }
      if (block['type'] === 'tool_result') visit(block['content']);
    }
  };
  if (record(requestOptions) && Array.isArray(requestOptions['messages'])) {
    for (const message of requestOptions['messages'])
      if (record(message)) visit(message['content']);
  }
  const addMetadata = (metadata: unknown) => {
    if (!record(metadata)) return;
    for (const key of ['b4.step', 'b4.answer']) {
      const value = metadata[key];
      if (!record(value) || !Array.isArray(value['sources'])) continue;
      for (const source of value['sources']) {
        if (
          record(source) &&
          typeof source['id'] === 'string' &&
          typeof source['title'] === 'string' &&
          ['url', 'file', 'document', 'record'].includes(String(source['kind']))
        )
          entries.push({
            source: { ...source } as unknown as ɵToolStepSource,
            position: -2,
          });
      }
    }
  };
  if (Array.isArray(inputMessages)) {
    for (const message of inputMessages) {
      if (!record(message)) continue;
      addMetadata(message['metadata']);
      if (Array.isArray(message['toolCalls']))
        for (const call of message['toolCalls'])
          if (record(call)) addMetadata(call['metadata']);
    }
  }
  return {
    responseId,
    entries,
    searchResults,
    documents,
    answerSources: [],
    answerIdentities: {},
    citations: [],
  };
}

/** Adds stable tool-owned sources at their native result position. @internal */
export function addAnthropicToolSources(
  context: AnthropicSourceContext,
  sources: readonly ɵToolStepSource[] | undefined,
  index: number,
  nativeBlock?: unknown,
): AnthropicSourceContext {
  const content = record(nativeBlock) ? nativeBlock['content'] : undefined;
  const document =
    record(content) && content['type'] === 'web_fetch_result'
      ? content['content']
      : undefined;
  return {
    ...context,
    entries: [
      ...context.entries,
      ...(sources ?? []).map((source) => ({
        source: { ...source },
        position: index,
      })),
    ],
    documents:
      record(document) && sources?.[0]
        ? [...context.documents, { ...sources[0] }]
        : context.documents,
  };
}

/** Resolves source-native citation coordinates to quote-only answer annotations. @internal */
export function resolveAnthropicCitation(
  context: AnthropicSourceContext,
  citation: unknown,
  index: number,
): { context: AnthropicSourceContext; annotations?: ɵAnswerAnnotations } {
  if (
    !record(citation) ||
    typeof citation['type'] !== 'string' ||
    typeof citation['cited_text'] !== 'string'
  )
    return { context };
  let source: ɵToolStepSource | undefined;
  if (
    citation['type'] === 'web_search_result_location' &&
    typeof citation['url'] === 'string'
  ) {
    const key = urlKey(citation['url']);
    source = [...context.entries]
      .reverse()
      .filter(
        (entry) =>
          entry.position < index &&
          entry.source.href !== undefined &&
          urlKey(entry.source.href) === key,
      )
      .sort((left, right) => right.position - left.position)[0]?.source;
    source ??= context.answerSources.find(
      (entry) => entry.href !== undefined && urlKey(entry.href) === key,
    );
    source ??= {
      id: `${context.responseId}:source:${context.answerSources.length}`,
      kind: 'url',
      title: title(citation['title'], citation['url']),
      href: citation['url'],
    };
  } else if (citation['type'] === 'search_result_location') {
    const position = citation['search_result_index'];
    if (
      typeof position === 'number' &&
      Number.isInteger(position) &&
      position >= 0
    )
      source = context.searchResults[position];
    if (!source && typeof citation['source'] === 'string')
      source = {
        id: `${context.responseId}:source:${context.answerSources.length}`,
        kind: 'url',
        title: title(citation['title'], citation['source']),
        href: citation['source'],
      };
  } else if (
    ['char_location', 'page_location', 'content_block_location'].includes(
      citation['type'],
    )
  ) {
    const position = citation['document_index'];
    const fileId = citation['file_id'];
    if (typeof fileId === 'string')
      source = [
        ...context.documents,
        ...context.entries.map((entry) => entry.source),
      ].find((entry) => entry.fileId === fileId);
    if (
      !source &&
      typeof position === 'number' &&
      Number.isInteger(position) &&
      position >= 0
    )
      source = context.documents[position];
    source ??= {
      id: `${context.responseId}:source:${context.answerSources.length}`,
      kind: typeof fileId === 'string' ? 'file' : 'document',
      title: title(
        citation['document_title'],
        typeof fileId === 'string'
          ? fileId
          : `Document ${typeof position === 'number' ? position + 1 : ''}`.trim(),
      ),
      ...(typeof fileId === 'string' ? { fileId } : {}),
    };
  }
  if (!source) return { context };
  const identity =
    typeof citation['file_id'] === 'string'
      ? `file:${citation['file_id']}`
      : source.href !== undefined
        ? `url:${urlKey(source.href)}`
        : `document:${String(citation['document_index'])}:${String(citation['document_title'])}`;
  const resolvedId = source.id;
  const knownSource =
    context.entries.some((entry) => entry.source.id === resolvedId) ||
    context.searchResults.some((entry) => entry.id === resolvedId) ||
    context.documents.some((entry) => entry.id === resolvedId);
  const existingId = context.answerIdentities[identity];
  if (!knownSource)
    source =
      context.answerSources.find((entry) => entry.id === existingId) ?? source;
  const toolOwned = context.entries.some(
    (entry) => entry.source.id === source.id,
  );
  const answerSources =
    toolOwned || context.answerSources.some((entry) => entry.id === source.id)
      ? context.answerSources
      : [...context.answerSources, source];
  const citations = [
    ...context.citations,
    {
      sourceId: source.id,
      ...(citation['cited_text'].length > 0
        ? { quote: citation['cited_text'] }
        : {}),
    },
  ];
  const next = {
    ...context,
    answerSources,
    citations,
    answerIdentities: { ...context.answerIdentities, [identity]: source.id },
  };
  return {
    context: next,
    annotations: {
      v: 1,
      citations,
      ...(answerSources.length ? { sources: [...answerSources] } : {}),
    },
  };
}
