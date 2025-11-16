import 'dotenv/config';
import { HashbrownAnthropic } from '@hashbrownai/anthropic';
import { HashbrownAzure } from '@hashbrownai/azure';
import { HashbrownGoogle } from '@hashbrownai/google';
import { HashbrownOpenAI } from '@hashbrownai/openai';
import { HashbrownWriter } from '@hashbrownai/writer';
import type { Chat } from '../models';

const azureModel =
  (process.env['AZURE_OPENAI_MODEL'] as Chat.Api.CompletionCreateParams['model']) ??
  'gpt-4o@2025-01-01-preview';

export interface ProviderConfig {
  id: string;
  displayName: string;
  model: Chat.Api.CompletionCreateParams['model'];
  supportsStructuredOutputs: boolean;
  emulateStructuredOutputs: boolean;
  supportsUiChat: boolean;
  isConfigured: boolean;
  reason?: string;
  createIterator: (
    request: Chat.Api.CompletionCreateParams,
  ) => AsyncIterable<Uint8Array> | Promise<AsyncIterable<Uint8Array>>;
}

const providerConfigs: ProviderConfig[] = [
  {
    id: 'openai',
    displayName: 'OpenAI',
    model: (process.env['OPENAI_MODEL'] as Chat.Api.CompletionCreateParams['model']) ?? 'gpt-4.1',
    supportsStructuredOutputs: true,
    emulateStructuredOutputs: false,
    supportsUiChat: true,
    isConfigured: Boolean(process.env['OPENAI_API_KEY']),
    reason: process.env['OPENAI_API_KEY'] ? undefined : 'OPENAI_API_KEY is not set',
    createIterator: (request) =>
      HashbrownOpenAI.stream.text({
        apiKey: process.env['OPENAI_API_KEY'] ?? '',
        request,
      }),
  },
  {
    id: 'azure',
    displayName: 'Azure OpenAI',
    model: azureModel,
    supportsStructuredOutputs: true,
    emulateStructuredOutputs: false,
    supportsUiChat: true,
    isConfigured: Boolean(process.env['AZURE_API_KEY'] && process.env['AZURE_ENDPOINT']),
    reason:
      process.env['AZURE_API_KEY'] && process.env['AZURE_ENDPOINT']
        ? undefined
        : 'AZURE_API_KEY and AZURE_ENDPOINT are required',
    createIterator: (request) =>
      HashbrownAzure.stream.text({
        apiKey: process.env['AZURE_API_KEY'] ?? '',
        endpoint: process.env['AZURE_ENDPOINT'] ?? '',
        request: { ...request, model: (request.model as string) ?? azureModel } as any,
      }),
  },
  {
    id: 'google',
    displayName: 'Google',
    model:
      (process.env['GOOGLE_MODEL'] as Chat.Api.CompletionCreateParams['model']) ??
      'gemini-2.5-flash-preview-05-20',
    supportsStructuredOutputs: false,
    emulateStructuredOutputs: true,
    supportsUiChat: false,
    isConfigured: Boolean(process.env['GOOGLE_API_KEY']),
    reason: process.env['GOOGLE_API_KEY'] ? undefined : 'GOOGLE_API_KEY is not set',
    createIterator: (request) =>
      HashbrownGoogle.stream.text({
        apiKey: process.env['GOOGLE_API_KEY'] ?? '',
        request,
      }),
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    model:
      (process.env['ANTHROPIC_MODEL'] as Chat.Api.CompletionCreateParams['model']) ??
      'claude-3-5-sonnet-20241022',
    supportsStructuredOutputs: false,
    emulateStructuredOutputs: true,
    supportsUiChat: false,
    isConfigured: Boolean(process.env['ANTHROPIC_API_KEY']),
    reason: process.env['ANTHROPIC_API_KEY'] ? undefined : 'ANTHROPIC_API_KEY is not set',
    createIterator: (request) =>
      HashbrownAnthropic.stream.text({
        apiKey: process.env['ANTHROPIC_API_KEY'] ?? '',
        request,
      }),
  },
  {
    id: 'writer',
    displayName: 'Writer',
    model:
      (process.env['WRITER_MODEL'] as Chat.Api.CompletionCreateParams['model']) ??
      'palmyra-x-004',
    supportsStructuredOutputs: false,
    emulateStructuredOutputs: true,
    supportsUiChat: true,
    isConfigured: Boolean(process.env['WRITER_API_KEY']),
    reason: process.env['WRITER_API_KEY'] ? undefined : 'WRITER_API_KEY is not set',
    createIterator: (request) =>
      HashbrownWriter.stream.text({
        apiKey: process.env['WRITER_API_KEY'] ?? '',
        request,
      }),
  },
];

export const e2eProviderMatrix = providerConfigs;
