import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import type {
  Content,
  GroundingMetadata,
  UrlContextMetadata,
} from '@google/genai';
import {
  ɵPROVIDER_HISTORY_EVENT_NAME,
  ɵPROVIDER_HISTORY_METADATA_KEY,
  ɵreadProviderHistory,
} from '@hashbrownai/core';

import { ownGoogleJson } from './google-json';
import {
  type GoogleProviderCall,
  matchGoogleProviderResult,
  readGoogleProviderCall,
} from './google-tools';

/** Native response fragments, ordered exactly as delivered. @internal */
export interface GoogleNativeCapture {
  readonly contents: readonly Content[];
  readonly groundingMetadata: readonly {
    readonly chunkIndex: number;
    readonly value: GroundingMetadata;
  }[];
  readonly urlContextMetadata: readonly {
    readonly chunkIndex: number;
    readonly value: UrlContextMetadata;
  }[];
}

/** Creates an empty native response capture. @internal */
export function createGoogleNativeCapture(): GoogleNativeCapture {
  return { contents: [], groundingMetadata: [], urlContextMetadata: [] };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function fail(detail: string): never {
  throw new Error(`Google provider history ${detail}`);
}

/** Reads untrusted Google response provenance. @internal */
export function googleMarker(
  metadata: unknown,
): Record<string, unknown> | undefined {
  return record(metadata) && record(metadata['google'])
    ? metadata['google']
    : undefined;
}

/** Recognizes provider steps independently of their version or provider. @internal */
export function isGoogleProviderMetadata(metadata: unknown): boolean {
  return (
    record(metadata) &&
    record(metadata['b4.step']) &&
    metadata['b4.step']['kind'] === 'provider'
  );
}

function ownJson<T>(value: T): T {
  try {
    return ownGoogleJson(value);
  } catch {
    return fail('contains invalid JSON');
  }
}

/** Validates required native fields while retaining opaque extension fields. @internal */
export function cloneGoogleHistoryContents(value: unknown): Content[] {
  const contents = ownJson(value);
  if (!Array.isArray(contents)) fail('contents must be an array');
  for (const content of contents) {
    if (
      !record(content) ||
      (content['role'] !== undefined && content['role'] !== 'model') ||
      !Array.isArray(content['parts'])
    )
      fail('contains invalid Content');
    for (const part of content['parts']) {
      if (!record(part)) fail('contains invalid Part');
      if (part['text'] !== undefined && typeof part['text'] !== 'string')
        fail('contains invalid text');
      if (
        part['thoughtSignature'] !== undefined &&
        typeof part['thoughtSignature'] !== 'string'
      )
        fail('contains invalid signature');
      if (part['thought'] !== undefined && typeof part['thought'] !== 'boolean')
        fail('contains invalid thought');
      for (const key of ['toolCall', 'toolResponse']) {
        const native = part[key];
        if (
          native !== undefined &&
          (!record(native) ||
            typeof native['toolType'] !== 'string' ||
            (native['id'] !== undefined && typeof native['id'] !== 'string') ||
            (native[key === 'toolCall' ? 'args' : 'response'] !== undefined &&
              !record(native[key === 'toolCall' ? 'args' : 'response'])))
        )
          fail(`contains invalid ${key}`);
      }
      for (const key of ['functionCall', 'functionResponse']) {
        const native = part[key];
        if (
          native !== undefined &&
          (!record(native) ||
            typeof native['name'] !== 'string' ||
            (native['id'] !== undefined && typeof native['id'] !== 'string') ||
            (native[key === 'functionCall' ? 'args' : 'response'] !==
              undefined &&
              !record(native[key === 'functionCall' ? 'args' : 'response'])))
        )
          fail(`contains invalid ${key}`);
      }
      if (
        part['executableCode'] !== undefined &&
        (!record(part['executableCode']) ||
          typeof part['executableCode']['code'] !== 'string' ||
          typeof part['executableCode']['language'] !== 'string')
      )
        fail('contains invalid executableCode');
      if (
        part['codeExecutionResult'] !== undefined &&
        (!record(part['codeExecutionResult']) ||
          typeof part['codeExecutionResult']['outcome'] !== 'string' ||
          (part['codeExecutionResult']['output'] !== undefined &&
            typeof part['codeExecutionResult']['output'] !== 'string'))
      )
        fail('contains invalid codeExecutionResult');
    }
  }
  return contents as Content[];
}

/** Appends owned native fragments and response-only metadata without merging or deduplication. @internal */
export function captureGoogleNativeChunk(
  state: GoogleNativeCapture,
  chunk: {
    content?: Content;
    groundingMetadata?: GroundingMetadata;
    urlContextMetadata?: UrlContextMetadata;
  },
  chunkIndex: number,
): GoogleNativeCapture {
  return {
    contents: chunk.content
      ? [...state.contents, ...cloneGoogleHistoryContents([chunk.content])]
      : state.contents,
    groundingMetadata: chunk.groundingMetadata
      ? [
          ...state.groundingMetadata,
          { chunkIndex, value: ownJson(chunk.groundingMetadata) },
        ]
      : state.groundingMetadata,
    urlContextMetadata: chunk.urlContextMetadata
      ? [
          ...state.urlContextMetadata,
          { chunkIndex, value: ownJson(chunk.urlContextMetadata) },
        ]
      : state.urlContextMetadata,
  };
}

/** Creates a complete footer only for a response with a real canonical carrier. @internal */
export function createGoogleHistoryFooter(
  state: GoogleNativeCapture,
  options: {
    ownerMessageId?: string;
    responseId: string;
    representedMessageIds: readonly string[];
  },
): AGUIEvent | undefined {
  if (
    !options.ownerMessageId ||
    !options.representedMessageIds.includes(options.ownerMessageId)
  )
    return undefined;
  const value = ɵreadProviderHistory({
    v: 1,
    provider: 'google',
    ownerMessageId: options.ownerMessageId,
    responseId: options.responseId,
    complete: true,
    payload: {
      contents: state.contents,
      representedMessageIds: [...options.representedMessageIds],
      ...(state.groundingMetadata.length
        ? { groundingMetadata: state.groundingMetadata }
        : {}),
      ...(state.urlContextMetadata.length
        ? { urlContextMetadata: state.urlContextMetadata }
        : {}),
    },
  });
  if (!value) fail('cannot create malformed footer');
  return { type: EventType.CUSTOM, name: ɵPROVIDER_HISTORY_EVENT_NAME, value };
}

/** Validated native responses anchored at their earliest canonical carrier. @internal */
export interface GoogleHistoryReplay {
  readonly responses: ReadonlyMap<string, Content[]>;
  readonly representedMessageIds: ReadonlySet<string>;
  readonly providerCallIds: ReadonlySet<string>;
}

function equalJson(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((item, index) => equalJson(item, right[index]))
    );
  if (!record(left) || !record(right)) return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        equalJson(left[key], right[key]),
    )
  );
}

function responseMatches(message: Message, responseId: string): boolean {
  const ids = [
    googleMarker(message.metadata)?.['responseId'],
    ...(message.role === 'assistant'
      ? (message.toolCalls ?? []).map(
          (call) => googleMarker(call.metadata)?.['responseId'],
        )
      : []),
  ].filter((id) => id !== undefined);
  return ids.length > 0 && ids.every((id) => id === responseId);
}
function nativeMarker(metadata: unknown): boolean {
  const marker = googleMarker(metadata);
  const part = marker?.['nativePart'];
  return (
    record(part) &&
    ['toolCall', 'toolResponse', 'executableCode', 'codeExecutionResult'].some(
      (key) => part[key] !== undefined,
    )
  );
}

function invocationPrecedesResult(
  invocation: unknown,
  result: unknown,
): boolean {
  const call = googleMarker(invocation);
  const response = googleMarker(result);
  if (!call || !response || call['responseId'] !== response['responseId'])
    return true;
  const callChunk = call['chunkIndex'];
  const resultChunk = response['chunkIndex'];
  if (typeof callChunk !== 'number' || typeof resultChunk !== 'number')
    return true;
  if (callChunk !== resultChunk) return callChunk < resultChunk;
  const callPart = call['partIndex'];
  const resultPart = response['partIndex'];
  return (
    typeof callPart !== 'number' ||
    typeof resultPart !== 'number' ||
    callPart < resultPart
  );
}

function validateCanonicalResult(
  messages: readonly Message[],
  message: Extract<Message, { role: 'tool' }>,
  index: number,
): void {
  const pending: GoogleProviderCall[] = [];
  for (const previous of messages.slice(0, index)) {
    if (previous.role === 'assistant') {
      for (const call of previous.toolCalls ?? []) {
        if (!invocationPrecedesResult(call.metadata, message.metadata))
          continue;
        const native = googleMarker(call.metadata)?.['nativePart'];
        const invocation = readGoogleProviderCall(native, call.id);
        if (invocation && invocation.id === call.id) pending.push(invocation);
      }
    } else if (previous.role === 'tool') {
      const settled = pending.findIndex(
        (call) => call.id === previous.toolCallId,
      );
      if (settled !== -1) pending.splice(settled, 1);
    }
  }
  const result = googleMarker(message.metadata)?.['nativePart'];
  const invocation = matchGoogleProviderResult(result, pending);
  if (!invocation || invocation.id !== message.toolCallId)
    fail('represented result does not match its canonical provider invocation');
}

/** Validates complete captures, provenance, nonoverlap and safe legacy replay. @internal */
export function readGoogleHistory(
  messages: readonly Message[],
): GoogleHistoryReplay {
  const canonical = new Map(
    messages.map((message, index) => [message.id, { message, index }]),
  );
  if (canonical.size !== messages.length)
    fail('contains duplicate canonical message ids');
  const providerCallIds = new Set<string>();
  const googleCalls = new Set<string>();
  for (const message of messages)
    if (message.role === 'assistant')
      for (const call of message.toolCalls ?? []) {
        if (
          isGoogleProviderMetadata(call.metadata) ||
          nativeMarker(call.metadata)
        )
          providerCallIds.add(call.id);
        const step = record(call.metadata)
          ? call.metadata['b4.step']
          : undefined;
        if (
          nativeMarker(call.metadata) ||
          (record(step) &&
            step['kind'] === 'provider' &&
            step['provider'] === 'google')
        )
          googleCalls.add(call.id);
      }
  const representedMessageIds = new Set<string>();
  const claimed = new Set<string>();
  const responseIds = new Set<string>();
  const responses = new Map<string, Content[]>();
  for (const owner of messages) {
    const raw = record(owner.metadata)
      ? owner.metadata[ɵPROVIDER_HISTORY_METADATA_KEY]
      : undefined;
    if (!record(raw) || raw['provider'] !== 'google') continue;
    const envelope = ɵreadProviderHistory(raw);
    if (!envelope) fail('envelope is malformed');
    if (envelope.ownerMessageId !== owner.id)
      fail('owner does not match canonical carrier');
    const ids = envelope.payload['representedMessageIds'];
    if (
      !Array.isArray(ids) ||
      ids.length === 0 ||
      !ids.every((id) => typeof id === 'string') ||
      new Set(ids).size !== ids.length ||
      !ids.includes(owner.id)
    )
      fail('representedMessageIds must contain unique canonical owner ids');
    let anchor = owner.id;
    let anchorIndex = Infinity;
    for (const id of ids) {
      const entry = canonical.get(id);
      if (
        !entry ||
        !['assistant', 'reasoning', 'tool'].includes(entry.message.role) ||
        !responseMatches(entry.message, envelope.responseId)
      )
        fail('represented message has invalid response identity');
      if (
        entry.message.role === 'tool' &&
        !googleCalls.has(entry.message.toolCallId)
      )
        fail('represented result has no provider invocation');
      if (claimed.has(id)) fail('captures overlap');
      if (entry.index < anchorIndex) {
        anchor = id;
        anchorIndex = entry.index;
      }
    }
    ids.forEach((id) => claimed.add(id));
    if (responseIds.has(envelope.responseId))
      fail('response has duplicated ownership');
    responseIds.add(envelope.responseId);
    const contents = cloneGoogleHistoryContents(envelope.payload['contents']);
    for (const id of ids) {
      const message = canonical.get(id)?.message;
      if (message?.role === 'tool') {
        const native = googleMarker(message.metadata)?.['nativePart'];
        if (
          !record(native) ||
          !['toolResponse', 'codeExecutionResult'].some(
            (key) =>
              native[key] !== undefined &&
              contents.some((content) =>
                content.parts?.some((part) =>
                  equalJson(
                    (part as Record<string, unknown>)[key],
                    native[key],
                  ),
                ),
              ),
          )
        )
          fail('represented result is absent from native capture');
        validateCanonicalResult(
          messages,
          message,
          canonical.get(id)?.index ?? -1,
        );
        continue;
      }
      if (message?.role !== 'assistant') continue;
      for (const call of message.toolCalls ?? []) {
        const marker = googleMarker(call.metadata);
        const native = marker?.['nativePart'];
        const present = contents.some((content) =>
          content.parts?.some((part) => {
            if (providerCallIds.has(call.id)) {
              if (record(native) && native['executableCode'] !== undefined)
                return (
                  part.executableCode !== undefined &&
                  equalJson(part.executableCode, native['executableCode'])
                );
              return part.toolCall?.id === call.id;
            }
            const nativeCall = part.functionCall;
            if (!nativeCall || nativeCall.name !== call.function.name)
              return false;
            if (nativeCall.id !== undefined) return nativeCall.id === call.id;
            try {
              return equalJson(
                nativeCall.args ?? {},
                JSON.parse(call.function.arguments),
              );
            } catch {
              return false;
            }
          }),
        );
        if (!present)
          fail('represented invocation is absent from native capture');
      }
    }
    if (!envelope.complete) {
      if (
        contents.some((content) =>
          content.parts?.some((part) =>
            Object.keys(part).some((key) => key !== 'text'),
          ),
        )
      )
        fail(
          'incomplete native response cannot safely replay tools or signatures',
        );
      continue;
    }
    ids.forEach((id) => representedMessageIds.add(id));
    responses.set(anchor, contents);
  }
  for (const message of messages) {
    if (representedMessageIds.has(message.id)) continue;
    if (
      nativeMarker(message.metadata) ||
      (message.role === 'assistant' &&
        message.toolCalls?.some((call) => googleCalls.has(call.id))) ||
      (message.role === 'tool' && googleCalls.has(message.toolCallId))
    )
      fail('requires a complete native capture to replay server tools');
  }
  return { responses, representedMessageIds, providerCallIds };
}
