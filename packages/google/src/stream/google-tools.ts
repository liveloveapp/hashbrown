import type { Part } from '@google/genai';
import {
  ɵbuiltInToolLabel,
  type ɵToolStep,
  type ɵToolStepSource,
} from '@hashbrownai/core';

import { ownGoogleJson } from './google-json';

/** A supported native invocation whose execution belongs to Google. @internal */
export interface GoogleProviderCall {
  readonly id: string;
  readonly nativeId?: string;
  readonly kind: 'tool' | 'code';
  readonly toolType?: string;
  readonly builtin: 'web_search' | 'web_fetch' | 'code_execution';
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly startedAt?: number;
  readonly nativePart: Part;
}

/** Readable result paired with a settled provider step. @internal */
export interface GoogleProviderResult {
  readonly step: ɵToolStep;
  readonly content: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ownedPart(value: unknown): Part {
  try {
    return ownGoogleJson(value) as Part;
  } catch {
    throw new Error('Google native tool part must be JSON-compatible');
  }
}

/** Reads actual server/code invocations without reclassifying app function calls. @internal */
export function readGoogleProviderCall(
  part: unknown,
  generatedId: string,
  startedAt?: number,
): GoogleProviderCall | undefined {
  if (!record(part)) return undefined;
  const nativePart = ownedPart(part);
  const tool = nativePart.toolCall;
  if (record(tool)) {
    const toolType = tool['toolType'];
    const builtin =
      toolType === 'GOOGLE_SEARCH_WEB' || toolType === 'GOOGLE_SEARCH_IMAGE'
        ? 'web_search'
        : toolType === 'URL_CONTEXT'
          ? 'web_fetch'
          : undefined;
    if (
      !builtin ||
      typeof tool['id'] !== 'string' ||
      !tool['id'] ||
      (tool['args'] !== undefined && !record(tool['args']))
    )
      return undefined;
    return {
      id: tool['id'],
      nativeId: tool['id'],
      kind: 'tool',
      toolType: String(toolType),
      builtin,
      name: builtin === 'web_search' ? 'google_search' : 'url_context',
      args: nativePart.toolCall?.args ?? {},
      ...(startedAt === undefined ? {} : { startedAt }),
      nativePart,
    };
  }
  const code = nativePart.executableCode;
  if (
    !record(code) ||
    typeof code['code'] !== 'string' ||
    typeof code['language'] !== 'string' ||
    !code['language'] ||
    (code['id'] !== undefined &&
      (typeof code['id'] !== 'string' || !code['id']))
  )
    return undefined;
  const nativeId = typeof code['id'] === 'string' ? code['id'] : undefined;
  return {
    id: nativeId ?? generatedId,
    ...(nativeId === undefined ? {} : { nativeId }),
    kind: 'code',
    builtin: 'code_execution',
    name: 'code_execution',
    args: { code: code['code'], language: code['language'] },
    ...(startedAt === undefined ? {} : { startedAt }),
    nativePart,
  };
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string =>
          typeof entry === 'string' && entry.length > 0,
      )
    : [];
}

function details(call: GoogleProviderCall) {
  const queries = strings(call.args['queries']);
  const urls = strings(call.args['urls']);
  return {
    query: call.builtin === 'web_fetch' ? urls[0] : queries[0],
    queries,
  };
}

function identity(call: GoogleProviderCall) {
  const queries = details(call).queries;
  return {
    v: 1 as const,
    kind: 'provider' as const,
    provider: 'google',
    builtin: call.builtin,
    icon:
      call.builtin === 'web_search'
        ? 'search'
        : call.builtin === 'web_fetch'
          ? 'read'
          : 'code',
    ...(call.startedAt === undefined ? {} : { startedAt: call.startedAt }),
    ...(queries.length ? { queries } : {}),
  };
}

/** Builds a running step without interpreting invocation closure as settlement. @internal */
export function googleRunningStep(call: GoogleProviderCall): ɵToolStep {
  return {
    ...identity(call),
    status: 'running',
    label: ɵbuiltInToolLabel(call.builtin, 'running', details(call)),
  };
}

/** Correlates results by native ID, accepting ID-less results only when unambiguous. @internal */
export function matchGoogleProviderResult(
  part: unknown,
  calls: readonly GoogleProviderCall[],
): GoogleProviderCall | undefined {
  if (!record(part)) return undefined;
  const isCode = record(part['codeExecutionResult']);
  const result = isCode ? part['codeExecutionResult'] : part['toolResponse'];
  if (!record(result)) return undefined;
  const id = result['id'];
  if (id !== undefined && (typeof id !== 'string' || id.length === 0))
    throw new Error('Google native result has an invalid ID');
  const compatible = (call: GoogleProviderCall) =>
    isCode
      ? call.kind === 'code'
      : call.kind === 'tool' && call.toolType === result['toolType'];
  if (typeof id === 'string') {
    const call = calls.find((call) => call.nativeId === id);
    if (call && !compatible(call))
      throw new Error(
        `Google result for ${id} has an incompatible native tool type`,
      );
    return call;
  }
  if (!isCode) return undefined;
  const candidates = calls.filter(compatible);
  if (candidates.length > 1)
    throw new Error('Google native result has ambiguous invocation identity');
  return candidates[0];
}

function explicitError(
  response: Record<string, unknown>,
): { message: string; code?: string } | undefined {
  const value = response['error'];
  if (typeof value === 'string' && value.trim()) return { message: value };
  if (
    record(value) &&
    typeof value['message'] === 'string' &&
    value['message'].trim()
  ) {
    const code = value['code'];
    return {
      message: value['message'],
      ...(typeof code === 'string' || typeof code === 'number'
        ? { code: String(code) }
        : {}),
    };
  }
  if (response['status'] === 'ERROR' || response['status'] === 'FAILED')
    return {
      message:
        typeof response['message'] === 'string' && response['message'].trim()
          ? response['message']
          : 'Google tool execution failed',
      code: String(response['status']),
    };
  return undefined;
}

/** Normalizes supported native results, retaining readable failures and source identity. @internal */
export function readGoogleProviderResult(
  call: GoogleProviderCall,
  part: unknown,
  settledAt = Date.now(),
): GoogleProviderResult | undefined {
  if (!record(part)) return undefined;
  const matched = matchGoogleProviderResult(part, [call]);
  if (matched !== call) return undefined;
  let readable: Record<string, unknown>;
  let error: { message: string; code?: string } | undefined;
  const sources: ɵToolStepSource[] = [];
  if (call.kind === 'code') {
    const result = part['codeExecutionResult'];
    if (!record(result)) return undefined;
    const outcome = result['outcome'];
    if (
      !['OUTCOME_OK', 'OUTCOME_FAILED', 'OUTCOME_DEADLINE_EXCEEDED'].includes(
        String(outcome),
      ) ||
      (result['output'] !== undefined && typeof result['output'] !== 'string')
    )
      return undefined;
    readable = { ...result };
    if (outcome !== 'OUTCOME_OK')
      error = {
        code: String(outcome),
        message:
          typeof result['output'] === 'string' && result['output'].trim()
            ? result['output']
            : `Code execution failed (${outcome})`,
      };
  } else {
    const result = part['toolResponse'];
    if (!record(result) || !record(result['response'])) return undefined;
    readable = { ...result['response'] };
    error = explicitError(readable);
    if (call.builtin === 'web_fetch') {
      const metadata = readable['url_metadata'] ?? readable['urlMetadata'];
      if (Array.isArray(metadata))
        for (const entry of metadata) {
          if (!record(entry)) continue;
          const url = entry['retrieved_url'] ?? entry['retrievedUrl'];
          const status =
            entry['url_retrieval_status'] ?? entry['urlRetrievalStatus'];
          if (
            typeof url === 'string' &&
            status === 'URL_RETRIEVAL_STATUS_SUCCESS'
          )
            sources.push({
              id: `${call.id}:${sources.length}`,
              kind: 'url',
              title: url,
              href: url,
            });
          if (
            [
              'URL_RETRIEVAL_STATUS_ERROR',
              'URL_RETRIEVAL_STATUS_PAYWALL',
              'URL_RETRIEVAL_STATUS_UNSAFE',
            ].includes(String(status))
          )
            error ??= {
              code: String(status),
              message: `Could not retrieve ${typeof url === 'string' ? url : (details(call).query ?? 'the requested URL')} (${status})`,
            };
        }
    }
  }
  const status = error ? 'failed' : 'completed';
  return {
    step: {
      ...identity(call),
      status,
      label: ɵbuiltInToolLabel(call.builtin, status, details(call)),
      settledAt: Math.max(settledAt, call.startedAt ?? settledAt),
      sources,
      ...(error === undefined ? {} : { error }),
    },
    content: JSON.stringify({
      ...readable,
      ...(error === undefined ? {} : { error: error.message }),
    }),
  };
}
