import type { ContentBlock } from '@aws-sdk/client-bedrock-runtime';
import {
  ɵbuiltInToolLabel,
  type ɵToolStep,
  type ɵToolStepSource,
} from '@hashbrownai/core';
import { decodeBedrockNative, encodeBedrockNative } from './bedrock-native';
import { isBedrockResultTypeCompatible } from './bedrock-history';

/** Native server invocation owned by Bedrock. @internal */
export interface BedrockProviderCall {
  readonly id: string;
  readonly name: string;
  readonly builtin?: 'web_search' | 'code_execution';
  readonly input: unknown;
  readonly nativeBlock: ContentBlock;
  readonly startedAt?: number;
}
/** Settled native tool result and its independent owned provenance. @internal */
export interface BedrockProviderResult {
  readonly step: ɵToolStep;
  readonly content: string;
  readonly nativeBlock: ContentBlock;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function owned<T>(value: T): T {
  return decodeBedrockNative(encodeBedrockNative(value, true)) as T;
}
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
function queries(call: BedrockProviderCall): string[] {
  if (call.builtin !== 'web_search' || !record(call.input)) return [];
  const query = text(call.input['query']);
  if (query) return [query];
  const values = call.input['queries'];
  return Array.isArray(values) &&
    values.length &&
    values.every((item) => text(item) !== undefined)
    ? ([...values] as string[])
    : [];
}
function identity(call: BedrockProviderCall) {
  const searchQueries = queries(call);
  return {
    v: 1 as const,
    kind: 'provider' as const,
    provider: 'bedrock',
    ...(call.builtin
      ? {
          builtin: call.builtin,
          icon: call.builtin === 'web_search' ? 'search' : 'code',
        }
      : {}),
    ...(call.startedAt === undefined ? {} : { startedAt: call.startedAt }),
    ...(searchQueries.length ? { queries: searchQueries } : {}),
  };
}
function label(
  call: BedrockProviderCall,
  status: 'running' | 'completed' | 'failed',
  sourceCount?: number,
): string {
  return ɵbuiltInToolLabel(call.builtin ?? call.name, status, {
    query: queries(call)[0],
    ...(sourceCount === undefined ? {} : { sourceCount }),
  });
}
/** Reads server-owned invocations, preserving arbitrary JSONDocument inputs. @internal */
export function readBedrockProviderCall(
  block: unknown,
  startedAt?: number,
): BedrockProviderCall | undefined {
  const native = owned(block);
  if (!record(native) || !record(native['toolUse'])) return undefined;
  const use = native['toolUse'];
  if (
    use['type'] !== 'server_tool_use' ||
    !text(use['toolUseId']) ||
    !text(use['name']) ||
    !Object.hasOwn(use, 'input')
  )
    return undefined;
  const nativeBlock = native as unknown as ContentBlock;
  const name = use['name'] as string;
  const builtin =
    name === 'nova_grounding'
      ? 'web_search'
      : name === 'nova_code_interpreter'
        ? 'code_execution'
        : undefined;
  return {
    id: use['toolUseId'] as string,
    name,
    input: owned(use['input']),
    nativeBlock,
    ...(builtin ? { builtin } : {}),
    ...(startedAt === undefined ? {} : { startedAt }),
  };
}
/** Creates a full running step without treating invocation closure as success. @internal */
export function bedrockRunningStep(call: BedrockProviderCall): ɵToolStep {
  return {
    ...identity(call),
    status: 'running',
    label: label(call, 'running'),
  };
}
/** Matches results only by unique native ID and rejects mismatched concrete families. @internal */
export function matchBedrockProviderResult(
  block: unknown,
  calls: readonly BedrockProviderCall[],
): BedrockProviderCall | undefined {
  const native = owned(block);
  if (!record(native) || !record(native['toolResult'])) return undefined;
  const result = native['toolResult'];
  if (!text(result['toolUseId'])) return undefined;
  const candidates = calls.filter((call) => call.id === result['toolUseId']);
  if (candidates.length > 1)
    throw new Error('Bedrock result has conflicting invocation identity');
  const call = candidates[0];
  if (call && !isBedrockResultTypeCompatible(call.name, result['type']))
    throw new Error('Bedrock result type does not match invocation family');
  return call;
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
function sources(
  call: BedrockProviderCall,
  members: readonly unknown[],
): ɵToolStepSource[] {
  const found: ɵToolStepSource[] = [];
  function add(value: unknown) {
    if (!record(value)) return;
    const href = httpUrl(value['url']) ?? httpUrl(value['source']);
    if (!href || found.some((source) => source.href === href)) return;
    found.push({
      id: `${call.id}:source:${found.length}`,
      kind: 'url',
      title: text(value['title']) ?? href,
      href,
    });
  }
  for (const member of members) {
    if (!record(member)) continue;
    add(member['searchResult']);
    const json = member['json'];
    if (!record(json)) continue;
    add(json);
    for (const key of ['sources', 'searchResults']) {
      const entries = json[key];
      if (Array.isArray(entries)) entries.forEach(add);
    }
  }
  return found;
}
function interpreterDocument(
  value: unknown,
): Record<string, unknown> | undefined {
  if (record(value)) return value;
  if (typeof value !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return record(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
function errorDetails(value: Record<string, unknown>): {
  message?: string;
  code?: string;
} {
  const error = value['error'];
  const code =
    (record(error) ? error['code'] : undefined) ??
    value['errorCode'] ??
    (typeof value['exitCode'] === 'number' && value['exitCode'] !== 0
      ? value['exitCode']
      : undefined);
  const message =
    text(error) ??
    (record(error) ? text(error['message']) : undefined) ??
    text(value['stdErr']) ??
    text(value['stderr']) ??
    text(value['message']);
  return {
    ...(message ? { message } : {}),
    ...(typeof code === 'string' || typeof code === 'number'
      ? { code: String(code) }
      : {}),
  };
}
/** Normalizes a completed native result while independently preserving its full native block. @internal */
export function readBedrockProviderResult(
  call: BedrockProviderCall,
  block: unknown,
  settledAt?: number,
): BedrockProviderResult | undefined {
  if (
    matchBedrockProviderResult(block, [call]) !== call ||
    !record(block) ||
    !record(block['toolResult'])
  )
    return undefined;
  const nativeBlock = owned(block) as unknown as ContentBlock;
  const result = (
    nativeBlock as unknown as Record<string, Record<string, unknown>>
  )['toolResult'];
  const members = result['content'];
  if (!Array.isArray(members)) return undefined;
  const readable: string[] = [];
  let failed = result['status'] === 'error';
  let details: { message?: string; code?: string } = {};
  function interpret(document: Record<string, unknown> | undefined) {
    if (!document) return;
    if (
      call.builtin === 'code_execution' &&
      (document['isError'] === true ||
        (typeof document['exitCode'] === 'number' &&
          document['exitCode'] !== 0))
    )
      failed = true;
    const next = errorDetails(document);
    if (next.message || next.code) details = { ...details, ...next };
  }
  let fragments = '';
  function flushText() {
    if (!fragments) return;
    readable.push(fragments);
    if (call.builtin === 'code_execution')
      interpret(interpreterDocument(fragments));
    fragments = '';
  }
  for (const member of members) {
    if (!record(member)) {
      flushText();
      continue;
    }
    if (typeof member['text'] === 'string') {
      fragments += member['text'];
      continue;
    }
    flushText();
    if (Object.hasOwn(member, 'json'))
      readable.push(JSON.stringify(member['json']));
    // SDK json members are atomic Documents. Only text members contain JSON-encoded interpreter output.
    if (record(member['json'])) interpret(member['json']);
  }
  flushText();
  const content = readable.join('\n');
  const toolSources = sources(call, members);
  const status = failed ? 'failed' : 'completed';
  const error = failed
    ? {
        message:
          details.message ??
          (content.trim() || 'Bedrock tool execution failed'),
        ...(details.code ? { code: details.code } : {}),
      }
    : undefined;
  return {
    step: {
      ...identity(call),
      status,
      label: label(call, status, toolSources.length),
      sources: toolSources,
      ...(settledAt === undefined
        ? {}
        : { settledAt: Math.max(settledAt, call.startedAt ?? settledAt) }),
      ...(error ? { error } : {}),
    },
    content: content.trim() ? content : (error?.message ?? ''),
    nativeBlock,
  };
}
