import type { ɵAnswerAnnotations, ɵToolStepSource } from '@hashbrownai/core';
import { decodeBedrockNative, encodeBedrockNative } from './bedrock-native';

/** Owned annotation fold state. @internal */
export interface BedrockAnnotationState {
  readonly responseId: string;
  readonly toolSources: readonly ɵToolStepSource[];
  readonly citations: readonly unknown[];
}
/** Fresh state plus an independently owned answer annotation snapshot. @internal */
export interface BedrockAnnotationFold {
  readonly state: BedrockAnnotationState;
  readonly annotations: ɵAnswerAnnotations;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function own<T>(value: T): T {
  return decodeBedrockNative(encodeBedrockNative(value, true)) as T;
}
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
function httpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}
function candidate(
  delta: unknown,
):
  | { key: string; source: Omit<ɵToolStepSource, 'id'>; quote?: string }
  | undefined {
  if (!record(delta)) return undefined;
  const location = record(delta['location']) ? delta['location'] : {};
  const web = record(location['web']) ? location['web'] : {};
  const href = httpUrl(web['url']) ?? httpUrl(delta['source']);
  const title = text(delta['title']);
  const content = delta['sourceContent'];
  const quote = Array.isArray(content)
    ? content
        .flatMap((part) =>
          record(part) && typeof part['text'] === 'string'
            ? [part['text']]
            : [],
        )
        .join('')
    : '';
  if (href)
    return {
      key: `url:${href}`,
      source: { kind: 'url', title: title ?? href, href },
      ...(quote ? { quote } : {}),
    };
  for (const kind of ['documentChar', 'documentPage', 'documentChunk']) {
    const reference = location[kind];
    if (
      !record(reference) ||
      !Number.isInteger(reference['documentIndex']) ||
      (reference['documentIndex'] as number) < 0
    )
      continue;
    if (
      ['start', 'end'].some(
        (key) =>
          reference[key] !== undefined &&
          (!Number.isInteger(reference[key]) || (reference[key] as number) < 0),
      )
    )
      continue;
    if (
      typeof reference['start'] === 'number' &&
      typeof reference['end'] === 'number' &&
      reference['end'] < reference['start']
    )
      continue;
    return {
      key: `document:${reference['documentIndex']}`,
      source: {
        kind: 'document',
        title:
          title ??
          text(delta['source']) ??
          `Document ${(reference['documentIndex'] as number) + 1}`,
      },
      ...(quote ? { quote } : {}),
    };
  }
  return undefined;
}
function snapshot(state: BedrockAnnotationState): BedrockAnnotationFold {
  const identities = new Map<string, ɵToolStepSource>();
  const answerSources: ɵToolStepSource[] = [];
  const citations: NonNullable<ɵAnswerAnnotations['citations']> = [];
  for (const delta of state.citations) {
    const value = candidate(delta);
    if (!value) continue;
    let source = identities.get(value.key);
    if (!source) {
      const proven =
        value.source.href === undefined
          ? undefined
          : state.toolSources.find(
              (entry) =>
                entry.kind === 'url' && entry.href === value.source.href,
            );
      source = proven ?? {
        id: `${state.responseId}:answer-source:${identities.size}`,
        ...value.source,
      };
      identities.set(value.key, source);
      if (!proven) answerSources.push(source);
    }
    citations.push({
      sourceId: source.id,
      ...(value.quote ? { quote: value.quote } : {}),
    });
  }
  return {
    state: own(state),
    annotations: own({ v: 1, sources: answerSources, citations }),
  };
}
/** Starts an answer citation fold with a stable response-scoped identity. @internal */
export function createBedrockAnnotationState(
  responseId: string,
): BedrockAnnotationState {
  return { responseId, toolSources: [], citations: [] };
}
/** Registers proven native tool sources and remaps all existing exact-URL citations. @internal */
export function addBedrockToolSources(
  state: BedrockAnnotationState,
  sources: readonly ɵToolStepSource[],
): BedrockAnnotationFold {
  const combined = [...state.toolSources];
  for (const source of own(sources)) {
    if (source.kind !== 'url' || !httpUrl(source.href)) continue;
    const previous = combined.find((entry) => entry.id === source.id);
    if (previous && previous.href !== source.href)
      throw new Error('Bedrock tool source has conflicting identity');
    if (!previous) combined.push(source);
  }
  return snapshot({ ...state, toolSources: combined });
}
/** Retains citation occurrences and emits quote-only references with independently owned metadata. @internal */
export function foldBedrockCitation(
  state: BedrockAnnotationState,
  delta: unknown,
): BedrockAnnotationFold {
  return snapshot({ ...state, citations: [...state.citations, own(delta)] });
}
