import type { Message } from '@ag-ui/core';
import type Anthropic from '@anthropic-ai/sdk';
import { ɵreadProviderHistory } from '@hashbrownai/core';

const HISTORY = 'hashbrown.provider-history';

/** An ordered, validated native response ready for replay. @internal */
export interface AnthropicHistoryReplay {
  readonly responses: ReadonlyMap<
    string,
    Anthropic.Messages.ContentBlockParam[]
  >;
  readonly representedMessageIds: ReadonlySet<string>;
  readonly providerCallIds: ReadonlySet<string>;
  readonly container?: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(detail: string): never {
  throw new Error(`Anthropic provider history ${detail}`);
}

/** Reads the adapter's native marker without assuming its contents are valid. @internal */
export function anthropicMarker(
  metadata: unknown,
): Record<string, unknown> | undefined {
  return record(metadata) && record(metadata['anthropic'])
    ? metadata['anthropic']
    : undefined;
}

/** Identifies provider-owned calls even when their step version is unreadable. @internal */
export function isProviderMetadata(metadata: unknown): boolean {
  return (
    record(metadata) &&
    record(metadata['b4.step']) &&
    metadata['b4.step']['kind'] === 'provider'
  );
}

function strings(value: Record<string, unknown>, ...keys: string[]): boolean {
  return keys.every((key) => typeof value[key] === 'string');
}

function caller(value: unknown): boolean {
  return (
    value === undefined ||
    (record(value) &&
      (value['type'] === 'direct' ||
        (['code_execution_20250825', 'code_execution_20260120'].includes(
          String(value['type']),
        ) &&
          typeof value['tool_id'] === 'string')))
  );
}

function citation(value: unknown): boolean {
  if (!record(value) || !strings(value, 'cited_text')) return false;
  switch (value['type']) {
    case 'web_search_result_location':
      return (
        strings(value, 'url', 'encrypted_index') &&
        (value['title'] === null || typeof value['title'] === 'string')
      );
    case 'char_location':
      return (
        (value['document_title'] === null ||
          typeof value['document_title'] === 'string') &&
        typeof value['document_index'] === 'number' &&
        typeof value['start_char_index'] === 'number' &&
        typeof value['end_char_index'] === 'number'
      );
    case 'page_location':
      return (
        (value['document_title'] === null ||
          typeof value['document_title'] === 'string') &&
        typeof value['document_index'] === 'number' &&
        typeof value['start_page_number'] === 'number' &&
        typeof value['end_page_number'] === 'number'
      );
    case 'content_block_location':
      return (
        (value['document_title'] === null ||
          typeof value['document_title'] === 'string') &&
        typeof value['document_index'] === 'number' &&
        typeof value['start_block_index'] === 'number' &&
        typeof value['end_block_index'] === 'number'
      );
    case 'search_result_location':
      return (
        strings(value, 'source') &&
        (value['title'] === null || typeof value['title'] === 'string') &&
        typeof value['search_result_index'] === 'number' &&
        typeof value['start_block_index'] === 'number' &&
        typeof value['end_block_index'] === 'number'
      );
    default:
      return false;
  }
}

function documentSource(value: unknown): boolean {
  if (!record(value)) return false;
  switch (value['type']) {
    case 'text':
      return value['media_type'] === 'text/plain' && strings(value, 'data');
    case 'base64':
      return (
        value['media_type'] === 'application/pdf' && strings(value, 'data')
      );
    case 'url':
      return strings(value, 'url');
    case 'file':
      return strings(value, 'file_id');
    case 'content':
      return (
        typeof value['content'] === 'string' ||
        (Array.isArray(value['content']) &&
          value['content'].every(
            (item) =>
              record(item) &&
              ((item['type'] === 'text' && strings(item, 'text')) ||
                (item['type'] === 'image' && record(item['source']))),
          ))
      );
    default:
      return false;
  }
}

function resultContent(value: unknown, family: string): boolean {
  if (family === 'web_search') {
    return Array.isArray(value)
      ? value.every(
          (item) =>
            record(item) &&
            item['type'] === 'web_search_result' &&
            strings(item, 'url', 'title', 'encrypted_content'),
        )
      : record(value) &&
          value['type'] === 'web_search_tool_result_error' &&
          strings(value, 'error_code');
  }
  if (!record(value)) return false;
  if (value['type'] === `${family}_tool_result_error`)
    return strings(value, 'error_code');
  switch (family) {
    case 'web_fetch':
      return (
        value['type'] === 'web_fetch_result' &&
        strings(value, 'url') &&
        record(value['content']) &&
        value['content']['type'] === 'document' &&
        documentSource(value['content']['source'])
      );
    case 'code_execution':
    case 'bash_code_execution':
      return (
        (value['type'] === `${family}_result` ||
          (family === 'code_execution' &&
            value['type'] === 'encrypted_code_execution_result')) &&
        Array.isArray(value['content']) &&
        value['content'].every(
          (item) =>
            record(item) &&
            item['type'] === `${family}_output` &&
            strings(item, 'file_id'),
        ) &&
        typeof value['return_code'] === 'number' &&
        strings(
          value,
          'stderr',
          value['type'] === 'encrypted_code_execution_result'
            ? 'encrypted_stdout'
            : 'stdout',
        )
      );
    case 'text_editor_code_execution':
      if (value['type'] === 'text_editor_code_execution_create_result')
        return typeof value['is_file_update'] === 'boolean';
      if (value['type'] === 'text_editor_code_execution_str_replace_result')
        return true;
      return (
        value['type'] === 'text_editor_code_execution_view_result' &&
        strings(value, 'content') &&
        ['text', 'image', 'pdf'].includes(String(value['file_type']))
      );
    case 'tool_search':
      return (
        value['type'] === 'tool_search_tool_search_result' &&
        Array.isArray(value['tool_references']) &&
        value['tool_references'].every(
          (item) =>
            record(item) &&
            item['type'] === 'tool_reference' &&
            strings(item, 'tool_name'),
        )
      );
    default:
      return false;
  }
}

/** Validates required native output fields while preserving the entire opaque block. @internal */
export function cloneAnthropicHistoryBlocks(
  value: unknown,
): Anthropic.Messages.ContentBlockParam[] {
  if (!Array.isArray(value)) fail('blocks must be an array');
  for (const block of value) {
    if (!record(block) || !caller(block['caller']))
      fail('contains an invalid native block');
    let valid = false;
    switch (block['type']) {
      case 'text':
        valid =
          strings(block, 'text') &&
          (block['citations'] == null ||
            (Array.isArray(block['citations']) &&
              block['citations'].every(citation)));
        break;
      case 'thinking':
        valid = strings(block, 'thinking', 'signature');
        break;
      case 'redacted_thinking':
        valid = strings(block, 'data');
        break;
      case 'tool_use':
      case 'server_tool_use':
        valid =
          strings(block, 'id', 'name') &&
          Object.prototype.hasOwnProperty.call(block, 'input') &&
          (block['type'] === 'tool_use' ||
            [
              'web_search',
              'web_fetch',
              'code_execution',
              'bash_code_execution',
              'text_editor_code_execution',
              'tool_search_tool_regex',
              'tool_search_tool_bm25',
            ].includes(String(block['name'])));
        break;
      case 'container_upload':
        valid = strings(block, 'file_id');
        break;
      default: {
        const type = String(block['type']);
        const family = type.endsWith('_tool_result') ? type.slice(0, -12) : '';
        valid =
          strings(block, 'tool_use_id') &&
          resultContent(block['content'], family);
      }
    }
    if (!valid) fail(`contains invalid ${String(block['type'])} block`);
  }
  return structuredClone(value) as Anthropic.Messages.ContentBlockParam[];
}

function responseMatches(message: Message, responseId: string): boolean {
  const marker = anthropicMarker(message.metadata);
  if (
    marker?.['responseId'] !== undefined &&
    marker['responseId'] !== responseId
  )
    return false;
  const calls = message.role === 'assistant' ? (message.toolCalls ?? []) : [];
  const identities = calls.flatMap((call) => {
    const id = anthropicMarker(call.metadata)?.['responseId'];
    return typeof id === 'string' ? [id] : [];
  });
  if (identities.some((id) => id !== responseId)) return false;
  return marker?.['responseId'] === responseId || identities.length > 0;
}

/** Validates canonical response ownership and collects complete native captures. @internal */
export function readAnthropicHistory(
  messages: readonly Message[],
): AnthropicHistoryReplay {
  const providerCallIds = new Set<string>();
  const nativeProviderCalls = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const call of message.toolCalls ?? []) {
      if (
        isProviderMetadata(call.metadata) ||
        anthropicMarker(call.metadata)?.['blockType'] === 'server_tool_use'
      )
        providerCallIds.add(call.id);
      if (anthropicMarker(call.metadata)?.['blockType'] === 'server_tool_use')
        nativeProviderCalls.add(call.id);
    }
  }
  const representedMessageIds = new Set<string>();
  const responseIds = new Set<string>();
  const claimedMessageIds = new Set<string>();
  const responses = new Map<string, Anthropic.Messages.ContentBlockParam[]>();
  const canonical = new Map(
    messages.map((message, index) => [message.id, { message, index }]),
  );
  if (canonical.size !== messages.length)
    fail('contains duplicate canonical message ids');
  let container: string | undefined;
  for (const owner of messages) {
    const raw = record(owner.metadata) ? owner.metadata[HISTORY] : undefined;
    if (!record(raw) || raw['provider'] !== 'anthropic') continue;
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
        !nativeProviderCalls.has(entry.message.toolCallId)
      )
        fail('represented result has no provider invocation');
      if (claimedMessageIds.has(id)) fail('captures overlap');
      if (entry.index < anchorIndex) {
        anchor = id;
        anchorIndex = entry.index;
      }
    }
    ids.forEach((id) => claimedMessageIds.add(id));
    if (responseIds.has(envelope.responseId))
      fail('response has duplicated ownership');
    responseIds.add(envelope.responseId);
    const blocks = cloneAnthropicHistoryBlocks(envelope.payload['blocks']);
    if (!envelope.complete) {
      if (blocks.some((block) => block.type !== 'text'))
        fail(
          'incomplete native response cannot safely replay server blocks or signatures',
        );
      continue;
    }
    ids.forEach((id) => representedMessageIds.add(id));
    responses.set(anchor, blocks);
    const nativeContainer = envelope.payload['container'];
    if (nativeContainer !== undefined && nativeContainer !== null) {
      if (
        !record(nativeContainer) ||
        !strings(nativeContainer, 'id', 'expires_at') ||
        !(
          nativeContainer['skills'] === null ||
          (Array.isArray(nativeContainer['skills']) &&
            nativeContainer['skills'].every(
              (skill) =>
                record(skill) &&
                strings(skill, 'skill_id', 'version') &&
                ['anthropic', 'custom'].includes(String(skill['type'])),
            ))
        )
      )
        fail('container is malformed');
      if (nativeContainer['id']) container = nativeContainer['id'] as string;
    }
  }
  for (const message of messages) {
    if (representedMessageIds.has(message.id)) continue;
    const nativeProvider =
      message.role === 'assistant' &&
      message.toolCalls?.some((call) => nativeProviderCalls.has(call.id));
    const nativeResult =
      message.role === 'tool' &&
      (nativeProviderCalls.has(message.toolCallId) ||
        anthropicMarker(message.metadata)
          ?.['blockType']?.toString()
          .endsWith('_tool_result'));
    if (nativeProvider || nativeResult)
      fail('requires a complete native capture to replay server tools');
  }
  return {
    responses,
    representedMessageIds,
    providerCallIds,
    ...(container ? { container } : {}),
  };
}
