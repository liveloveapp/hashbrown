import {
  ɵbuiltInToolLabel,
  type ɵToolStep,
  type ɵToolStepSource,
} from '@hashbrownai/core';

/** A native invocation whose execution belongs to Anthropic. @internal */
export interface AnthropicServerToolCall {
  readonly id: string;
  readonly name: string;
  readonly builtin: 'web_search' | 'web_fetch' | 'code_execution';
  readonly input: unknown;
  readonly startedAt?: number;
  readonly parentToolCallId?: string;
}

/** Readable public result and its settled contract step. @internal */
export interface AnthropicServerToolResult {
  readonly step: ɵToolStep;
  readonly content: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Reads only supported native server invocations, never same-named app calls. @internal */
export function readAnthropicServerToolCall(
  value: unknown,
  startedAt?: number,
): AnthropicServerToolCall | undefined {
  if (
    !record(value) ||
    value['type'] !== 'server_tool_use' ||
    typeof value['id'] !== 'string' ||
    value['id'].length === 0 ||
    typeof value['name'] !== 'string' ||
    !Object.hasOwn(value, 'input')
  )
    return undefined;
  const name = value['name'];
  const builtin =
    name === 'web_search' || name === 'web_fetch'
      ? name
      : [
            'code_execution',
            'bash_code_execution',
            'text_editor_code_execution',
          ].includes(name)
        ? 'code_execution'
        : undefined;
  if (!builtin) return undefined;
  const caller = value['caller'];
  const parent =
    record(caller) &&
    typeof caller['type'] === 'string' &&
    caller['type'].startsWith('code_execution_') &&
    typeof caller['tool_id'] === 'string'
      ? caller['tool_id']
      : undefined;
  return {
    id: value['id'],
    name,
    builtin,
    input: value['input'],
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(parent === undefined ? {} : { parentToolCallId: parent }),
  };
}

function query(call: AnthropicServerToolCall): string | undefined {
  if (!record(call.input)) return undefined;
  const value = call.input[call.builtin === 'web_fetch' ? 'url' : 'query'];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function identity(call: AnthropicServerToolCall) {
  const searchQuery = call.builtin === 'web_search' ? query(call) : undefined;
  return {
    v: 1 as const,
    kind: 'provider' as const,
    provider: 'anthropic',
    builtin: call.builtin,
    icon:
      call.builtin === 'web_search'
        ? 'search'
        : call.builtin === 'web_fetch'
          ? 'read'
          : 'code',
    ...(call.startedAt === undefined ? {} : { startedAt: call.startedAt }),
    ...(call.parentToolCallId === undefined
      ? {}
      : { parentToolCallId: call.parentToolCallId }),
    ...(searchQuery === undefined ? {} : { queries: [searchQuery] }),
  };
}

/** Builds the current execution step without conflating invocation END and success. @internal */
export function anthropicRunningStep(call: AnthropicServerToolCall): ɵToolStep {
  return {
    ...identity(call),
    status: 'running',
    label: ɵbuiltInToolLabel(call.builtin, 'running', { query: query(call) }),
  };
}

function outputFiles(
  value: unknown,
  id: string,
): ɵToolStepSource[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const files: ɵToolStepSource[] = [];
  for (const entry of value) {
    if (
      !record(entry) ||
      (entry['type'] !== 'code_execution_output' &&
        entry['type'] !== 'bash_code_execution_output') ||
      typeof entry['file_id'] !== 'string'
    )
      return undefined;
    files.push({
      id: `${id}:${files.length}`,
      kind: 'file',
      title: `Output file ${files.length + 1}`,
      fileId: entry['file_id'],
    });
  }
  return files;
}

function documentText(value: unknown): string | undefined {
  if (!record(value)) return undefined;
  if (value['type'] === 'text' && typeof value['data'] === 'string')
    return value['data'];
  if (value['type'] !== 'content') return undefined;
  if (typeof value['content'] === 'string') return value['content'];
  if (!Array.isArray(value['content'])) return undefined;
  return value['content']
    .flatMap((part) =>
      record(part) &&
      part['type'] === 'text' &&
      typeof part['text'] === 'string'
        ? [part['text']]
        : [],
    )
    .join('\n');
}

/** Normalizes recognized result families; opaque encrypted data stays in native metadata. @internal */
export function readAnthropicServerToolResult(
  call: AnthropicServerToolCall,
  value: unknown,
  settledAt = Date.now(),
): AnthropicServerToolResult | undefined {
  if (!record(value) || value['tool_use_id'] !== call.id) return undefined;
  const expected =
    call.builtin === 'web_search'
      ? ['web_search_tool_result']
      : call.builtin === 'web_fetch'
        ? ['web_fetch_tool_result']
        : [
            'code_execution_tool_result',
            'bash_code_execution_tool_result',
            'text_editor_code_execution_tool_result',
          ];
  if (!expected.includes(String(value['type']))) return undefined;
  const content = value['content'];
  let sources: ɵToolStepSource[] = [];
  let readable: unknown;
  let error: { message: string; code?: string } | undefined;
  if (
    record(content) &&
    typeof content['type'] === 'string' &&
    content['type'].endsWith('_error')
  ) {
    if (content['type'] !== `${value['type']}_error`) return undefined;
    if (typeof content['error_code'] !== 'string') return undefined;
    const code = content['error_code'];
    error = {
      code,
      message:
        typeof content['error_message'] === 'string' &&
        content['error_message'].trim()
          ? content['error_message']
          : `${call.name} failed (${code})`,
    };
    readable = { error: error.message, code };
  } else if (
    value['type'] === 'web_search_tool_result' &&
    Array.isArray(content)
  ) {
    for (const entry of content) {
      if (
        !record(entry) ||
        entry['type'] !== 'web_search_result' ||
        typeof entry['url'] !== 'string' ||
        typeof entry['title'] !== 'string'
      )
        return undefined;
      sources.push({
        id: `${call.id}:${sources.length}`,
        kind: 'url',
        title: entry['title'] || entry['url'],
        href: entry['url'],
      });
    }
    readable = {
      results: sources.map(({ title, href }) => ({ title, url: href })),
    };
  } else if (
    value['type'] === 'web_fetch_tool_result' &&
    record(content) &&
    content['type'] === 'web_fetch_result' &&
    typeof content['url'] === 'string' &&
    record(content['content'])
  ) {
    const document = content['content'];
    const title =
      typeof document['title'] === 'string' && document['title']
        ? document['title']
        : content['url'];
    sources = [
      { id: `${call.id}:0`, kind: 'url', title, href: content['url'] },
    ];
    readable = {
      url: content['url'],
      title,
      text: documentText(document['source']),
    };
  } else if (
    record(content) &&
    ((value['type'] === 'code_execution_tool_result' &&
      ['code_execution_result', 'encrypted_code_execution_result'].includes(
        String(content['type']),
      )) ||
      (value['type'] === 'bash_code_execution_tool_result' &&
        content['type'] === 'bash_code_execution_result'))
  ) {
    if (
      typeof content['return_code'] !== 'number' ||
      !Number.isInteger(content['return_code']) ||
      typeof content['stderr'] !== 'string'
    )
      return undefined;
    const files = outputFiles(content['content'], call.id);
    if (!files) return undefined;
    sources = files;
    const encrypted = content['type'] === 'encrypted_code_execution_result';
    if (typeof content[encrypted ? 'encrypted_stdout' : 'stdout'] !== 'string')
      return undefined;
    readable = {
      ...(encrypted
        ? { output: 'Encrypted code output retained in native history' }
        : { stdout: content['stdout'] }),
      stderr: content['stderr'],
      returnCode: content['return_code'],
      files: sources.map(({ fileId, title }) => ({ fileId, title })),
    };
    if (content['return_code'] !== 0)
      error = {
        message: `Code execution exited with code ${content['return_code']}`,
        code: String(content['return_code']),
      };
  } else if (
    value['type'] === 'text_editor_code_execution_tool_result' &&
    record(content) &&
    [
      'text_editor_code_execution_create_result',
      'text_editor_code_execution_view_result',
      'text_editor_code_execution_str_replace_result',
    ].includes(String(content['type']))
  ) {
    readable = {
      type: content['type'],
      ...(content['file_type'] === 'text' &&
      typeof content['content'] === 'string'
        ? { content: content['content'] }
        : {}),
      ...(Array.isArray(content['lines']) ? { lines: content['lines'] } : {}),
    };
  } else return undefined;
  const status = error ? 'failed' : 'completed';
  return {
    step: {
      ...identity(call),
      status,
      settledAt: Math.max(settledAt, call.startedAt ?? settledAt),
      label: ɵbuiltInToolLabel(call.builtin, status, {
        query: query(call),
        ...(call.builtin === 'web_search'
          ? { sourceCount: sources.length }
          : {}),
      }),
      sources,
      ...(error ? { error } : {}),
    },
    content: JSON.stringify(readable),
  };
}
