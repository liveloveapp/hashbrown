import { type AGUIEvent, EventType, type Message } from '@ag-ui/core';
import type { ContentBlock } from '@aws-sdk/client-bedrock-runtime';
import {
  ɵPROVIDER_HISTORY_EVENT_NAME,
  ɵPROVIDER_HISTORY_METADATA_KEY,
  ɵreadProviderHistory,
} from '@hashbrownai/core';
import {
  type BedrockCapture,
  decodeBedrockNative,
  encodeBedrockNative,
  readBedrockCaptureContent,
} from './bedrock-native';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function fail(detail: string): never {
  throw new Error(`Bedrock provider history ${detail}`);
}
/** Reads Bedrock native provenance metadata. @internal */
export function bedrockMarker(
  metadata: unknown,
): Record<string, unknown> | undefined {
  return record(metadata) && record(metadata['bedrock'])
    ? metadata['bedrock']
    : undefined;
}
/** Recognizes all provider metadata, including foreign providers and future versions. @internal */
export function isBedrockProviderMetadata(metadata: unknown): boolean {
  return (
    record(metadata) &&
    record(metadata['b4.step']) &&
    metadata['b4.step']['kind'] === 'provider'
  );
}
function nativeBlock(metadata: unknown): Record<string, unknown> | undefined {
  const native = bedrockMarker(metadata)?.['nativeBlock'];
  if (native === undefined) return undefined;
  const value = decodeBedrockNative(native);
  if (!record(value)) fail('native provenance must be a block');
  return value;
}
/** Matches explicit native result families without treating call completion as success. @internal */
export function isBedrockResultTypeCompatible(
  name: unknown,
  type: unknown,
): boolean {
  return (
    type === undefined ||
    type === 'server_tool_result' ||
    type === name ||
    type === `${name}_result`
  );
}
function equal(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(encodeBedrockNative(left)) ===
    JSON.stringify(encodeBedrockNative(right))
  );
}

/** Creates a complete footer only after native completion and a real canonical owner. @internal */
export function createBedrockHistoryFooter(
  state: BedrockCapture,
  options: {
    ownerMessageId?: string;
    responseId: string;
    representedMessageIds: readonly string[];
  },
  normalEOF = true,
): AGUIEvent | undefined {
  const content = readBedrockCaptureContent(state, normalEOF);
  if (
    !content ||
    !options.ownerMessageId ||
    !options.representedMessageIds.includes(options.ownerMessageId)
  )
    return undefined;
  const value = ɵreadProviderHistory({
    v: 1,
    provider: 'bedrock',
    ownerMessageId: options.ownerMessageId,
    responseId: options.responseId,
    complete: true,
    payload: {
      content: encodeBedrockNative(content),
      representedMessageIds: [...options.representedMessageIds],
    },
  });
  if (!value) fail('cannot create malformed footer');
  return { type: EventType.CUSTOM, name: ɵPROVIDER_HISTORY_EVENT_NAME, value };
}
/** Validated native responses anchored at the earliest represented canonical message. @internal */
export interface BedrockHistoryReplay {
  readonly responses: ReadonlyMap<string, ContentBlock[]>;
  readonly representedMessageIds: ReadonlySet<string>;
  readonly providerCallIds: ReadonlySet<string>;
}

function document(value: unknown): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  )
    return true;
  if (Array.isArray(value)) return value.every(document);
  return (
    record(value) &&
    !(value instanceof Uint8Array) &&
    Object.values(value).every(document)
  );
}
function image(value: unknown): boolean {
  return (
    record(value) &&
    typeof value['format'] === 'string' &&
    record(value['source']) &&
    (value['source']['bytes'] instanceof Uint8Array ||
      record(value['source']['s3Location']))
  );
}
/** Validates required native fields while retaining owned opaque SDK extension data. @internal */
export function readBedrockNativeContent(value: unknown): ContentBlock[] {
  const decoded = decodeBedrockNative(value);
  if (!Array.isArray(decoded)) fail('content must be an encoded array');
  for (const block of decoded) {
    if (!record(block) || Object.keys(block).length !== 1)
      fail('invalid native ContentBlock');
    const key = Object.keys(block)[0];
    const body = block[key];
    if (key === 'text') {
      if (typeof body !== 'string') fail('invalid text');
      continue;
    }
    if (!record(body)) fail('invalid native block payload');
    switch (key) {
      case 'toolUse':
        if (
          typeof body['toolUseId'] !== 'string' ||
          !body['toolUseId'] ||
          typeof body['name'] !== 'string' ||
          !body['name'] ||
          !Object.hasOwn(body, 'input') ||
          !document(body['input']) ||
          (body['type'] !== undefined &&
            (typeof body['type'] !== 'string' || !body['type']))
        )
          fail('invalid native invocation');
        break;
      case 'toolResult':
        if (
          typeof body['toolUseId'] !== 'string' ||
          !body['toolUseId'] ||
          !Array.isArray(body['content']) ||
          (body['type'] !== undefined && typeof body['type'] !== 'string') ||
          (body['status'] !== undefined &&
            !['success', 'error'].includes(body['status'] as string))
        )
          fail('invalid native result');
        for (const member of body['content'] as unknown[]) {
          if (!record(member) || Object.keys(member).length !== 1)
            fail('invalid native result member');
          const memberKey = Object.keys(member)[0];
          if (
            memberKey === 'json'
              ? !document(member['json'])
              : memberKey === 'text'
                ? typeof member['text'] !== 'string'
                : memberKey === 'image'
                  ? !image(member['image'])
                  : !['document', 'video', 'searchResult'].includes(
                      memberKey,
                    ) || !record(member[memberKey])
          )
            fail('invalid native result member');
        }
        break;
      case 'reasoningContent': {
        if (Object.keys(body).length !== 1) fail('invalid reasoning union');
        if (body['redactedContent'] instanceof Uint8Array) break;
        const reasoning = body['reasoningText'];
        if (
          !record(reasoning) ||
          typeof reasoning['text'] !== 'string' ||
          (reasoning['signature'] !== undefined &&
            typeof reasoning['signature'] !== 'string')
        )
          fail('invalid signed reasoning');
        break;
      }
      case 'citationsContent':
        if (
          body['content'] !== undefined &&
          (!Array.isArray(body['content']) ||
            !body['content'].every(
              (member) => record(member) && typeof member['text'] === 'string',
            ))
        )
          fail('invalid citation content');
        if (
          body['citations'] !== undefined &&
          (!Array.isArray(body['citations']) ||
            !body['citations'].every(
              (citation) =>
                record(citation) &&
                (citation['title'] === undefined ||
                  typeof citation['title'] === 'string') &&
                (citation['source'] === undefined ||
                  typeof citation['source'] === 'string') &&
                (citation['sourceContent'] === undefined ||
                  (Array.isArray(citation['sourceContent']) &&
                    citation['sourceContent'].every(
                      (part) =>
                        record(part) && typeof part['text'] === 'string',
                    ))),
            ))
        )
          fail('invalid citations');
        break;
      case 'image':
        if (!image(body)) fail('invalid image');
        break;
      default:
        fail('unsupported native block');
    }
  }
  return decoded as ContentBlock[];
}

/** Validates complete capture ownership, native provenance and chronological result identity. @internal */
export function readBedrockHistory(
  messages: readonly Message[],
): BedrockHistoryReplay {
  const canonical = new Map(
    messages.map((message, index) => [message.id, { message, index }]),
  );
  if (canonical.size !== messages.length)
    fail('contains duplicate canonical message ids');
  const providerCallIds = new Set<string>();
  const ownCallIds = new Set<string>();
  for (const message of messages)
    if (message.role === 'assistant')
      for (const call of message.toolCalls ?? []) {
        const native = nativeBlock(call.metadata);
        const use = native?.['toolUse'];
        const step = record(call.metadata)
          ? call.metadata['b4.step']
          : undefined;
        if (
          isBedrockProviderMetadata(call.metadata) ||
          (record(use) &&
            typeof use['type'] === 'string' &&
            Boolean(use['type']))
        )
          providerCallIds.add(call.id);
        if (
          (record(use) &&
            typeof use['type'] === 'string' &&
            Boolean(use['type'])) ||
          (record(step) &&
            step['kind'] === 'provider' &&
            step['provider'] === 'bedrock')
        )
          ownCallIds.add(call.id);
      }
  const responses = new Map<string, ContentBlock[]>();
  const representedMessageIds = new Set<string>();
  const responseIds = new Set<string>();
  const pending = new Map<string, Record<string, unknown>>();
  const nativeCallIds = new Set<string>();
  const nativeResultIds = new Set<string>();
  for (const owner of messages) {
    const raw = record(owner.metadata)
      ? owner.metadata[ɵPROVIDER_HISTORY_METADATA_KEY]
      : undefined;
    if (!record(raw) || raw['provider'] !== 'bedrock') continue;
    const envelope = ɵreadProviderHistory(raw);
    if (!envelope || envelope.ownerMessageId !== owner.id)
      fail('invalid envelope owner');
    if (!envelope.complete) continue;
    const ids = envelope.payload['representedMessageIds'];
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      !ids.every((id) => typeof id === 'string') ||
      new Set(ids).size !== ids.length ||
      !ids.includes(owner.id)
    )
      fail('invalid represented message ids');
    const content = readBedrockNativeContent(envelope.payload['content']);
    if (responseIds.has(envelope.responseId))
      fail('duplicate response ownership');
    responseIds.add(envelope.responseId);
    const entries = ids
      .map((id) => {
        const entry = canonical.get(id);
        if (
          !entry ||
          !['assistant', 'reasoning', 'tool'].includes(entry.message.role) ||
          bedrockMarker(entry.message.metadata)?.['responseId'] !==
            envelope.responseId
        )
          fail('invalid represented response identity');
        if (representedMessageIds.has(id)) fail('captures overlap');
        return entry;
      })
      .sort((a, b) => a.index - b.index);
    const representedIds = new Set(ids);
    if (
      messages
        .slice(entries[0].index, entries[entries.length - 1].index + 1)
        .some(
          (message) =>
            ['assistant', 'reasoning', 'tool', 'user'].includes(message.role) &&
            !representedIds.has(message.id),
        )
    )
      fail('capture crosses canonical turn chronology');
    const canonicalText = entries
      .flatMap(({ message }) =>
        message.role === 'assistant' && message.content
          ? [message.content]
          : [],
      )
      .join('');
    const nativeText = content
      .flatMap((block) =>
        block.text !== undefined
          ? [block.text]
          : (block.citationsContent?.content?.map((part) => part.text ?? '') ??
            []),
      )
      .join('');
    if (canonicalText !== nativeText)
      fail('canonical text differs from native capture');
    for (const { message, index } of entries) {
      if (
        message.role === 'reasoning' &&
        !content.some((block) => {
          const reasoning = block.reasoningContent;
          return reasoning?.reasoningText
            ? reasoning.reasoningText.text === message.content &&
                reasoning.reasoningText.signature === message.encryptedValue
            : reasoning?.redactedContent instanceof Uint8Array &&
                message.content === '' &&
                Buffer.from(reasoning.redactedContent).toString('base64') ===
                  message.encryptedValue;
        })
      )
        fail('canonical reasoning differs from native capture');

      if (message.role === 'assistant')
        for (const call of message.toolCalls ?? []) {
          const block = nativeBlock(call.metadata);
          const use = block?.['toolUse'];
          const match = content.find(
            (item) => item.toolUse?.toolUseId === call.id,
          )?.toolUse;
          if (
            !match ||
            match.name !== call.function.name ||
            !equal(match.input, JSON.parse(call.function.arguments))
          )
            fail('represented invocation is absent from native capture');
          if (
            providerCallIds.has(call.id) &&
            (!record(use) ||
              use['toolUseId'] !== call.id ||
              typeof use['type'] !== 'string' ||
              !use['type'] ||
              !equal(use, match) ||
              bedrockMarker(call.metadata)?.['responseId'] !==
                envelope.responseId)
          )
            fail('invalid invocation provenance');
        }
      if (message.role === 'tool') {
        const block = nativeBlock(message.metadata);
        const result = block?.['toolResult'];
        if (
          !ownCallIds.has(message.toolCallId) ||
          !record(result) ||
          result['toolUseId'] !== message.toolCallId ||
          !content.some(
            (item) =>
              item.toolResult !== undefined && equal(item.toolResult, result),
          )
        )
          fail('invalid result provenance');
        const calls = messages
          .slice(0, index)
          .flatMap((previous) =>
            previous.role === 'assistant' ? (previous.toolCalls ?? []) : [],
          )
          .filter((call) => call.id === message.toolCallId);
        if (
          calls.length !== 1 ||
          messages
            .slice(0, index)
            .some(
              (previous) =>
                previous.role === 'tool' &&
                previous.toolCallId === message.toolCallId,
            )
        )
          fail('result has no pending invocation');
        const nativeInvocationIndex = content.findIndex(
          (block) => block.toolUse?.toolUseId === message.toolCallId,
        );
        const nativeResultIndex = content.findIndex(
          (block) =>
            block.toolResult !== undefined && equal(block.toolResult, result),
        );
        if (
          nativeInvocationIndex !== -1 &&
          nativeResultIndex <= nativeInvocationIndex
        )
          fail('result precedes invocation');
        const invocation = nativeBlock(calls[0].metadata)?.['toolUse'];
        if (
          !record(invocation) ||
          !isBedrockResultTypeCompatible(invocation['name'], result['type'])
        )
          fail('result type does not match invocation');
        const callMarker = bedrockMarker(calls[0].metadata);
        const resultMarker = bedrockMarker(message.metadata);
        if (
          callMarker?.['responseId'] === resultMarker?.['responseId'] &&
          typeof callMarker?.['blockIndex'] === 'number' &&
          typeof resultMarker?.['blockIndex'] === 'number' &&
          callMarker['blockIndex'] >= resultMarker['blockIndex']
        )
          fail('result precedes invocation');
      }
    }
    for (const block of content) {
      if (block.toolUse) {
        const invocation = block.toolUse;
        const callId =
          invocation.toolUseId ?? fail('missing native invocation id');
        if (nativeCallIds.has(callId))
          fail('conflicting native invocation identity');
        nativeCallIds.add(callId);
        const canonicalCalls = entries
          .flatMap(({ message }) =>
            message.role === 'assistant' ? (message.toolCalls ?? []) : [],
          )
          .filter((call) => call.id === callId);
        if (
          (invocation.type === undefined ||
            invocation.type === 'server_tool_use') &&
          canonicalCalls.length !== 1
        )
          fail('native invocation has no unique canonical carrier');
        if (
          canonicalCalls.length === 1 &&
          Boolean(invocation.type) !== providerCallIds.has(callId)
        )
          fail('native invocation ownership differs from canonical call');
      }
      if (block.toolUse?.type) {
        if (
          pending.has(
            block.toolUse.toolUseId ?? fail('missing native invocation id'),
          )
        )
          fail('conflicting native invocation identity');
        pending.set(
          block.toolUse.toolUseId ?? fail('missing native invocation id'),
          block.toolUse as unknown as Record<string, unknown>,
        );
      }
      if (block.toolResult) {
        const resultId =
          block.toolResult.toolUseId ?? fail('missing native result id');
        if (
          !ownCallIds.has(resultId) &&
          messages.some(
            (message) =>
              message.role === 'assistant' &&
              message.toolCalls?.some((call) => call.id === resultId),
          )
        )
          fail('native assistant result cannot settle an application call');
        if (nativeResultIds.has(resultId))
          fail('duplicate native result identity');
        nativeResultIds.add(resultId);
        const call = pending.get(
          block.toolResult.toolUseId ?? fail('missing native result id'),
        );
        if (
          call &&
          !isBedrockResultTypeCompatible(call['name'], block.toolResult.type)
        )
          fail('native result type mismatch');
        if (call)
          pending.delete(
            block.toolResult.toolUseId ?? fail('missing native result id'),
          );
      }
    }
    ids.forEach((id) => representedMessageIds.add(id));
    responses.set(entries[0].message.id, content);
  }
  for (const message of messages) {
    if (representedMessageIds.has(message.id)) continue;
    if (
      nativeBlock(message.metadata) ||
      (message.role === 'assistant' &&
        message.toolCalls?.some((call) => ownCallIds.has(call.id))) ||
      (message.role === 'tool' && ownCallIds.has(message.toolCallId))
    )
      fail(
        'requires a complete native capture to replay server tools and signatures',
      );
  }
  return { responses, representedMessageIds, providerCallIds };
}
