import { System } from '@schematics/angular/third_party/github.com/Microsoft/TypeScript/lib/typescript';
import * as dotenv from 'dotenv';
import OpenAI from 'openai';
import { AssistantMessage } from '../../types/AssistantMessage';
import { ChatMessage } from '../../types/ChatMessage';
import { SystemMessage } from '../../types/SystemMessage';
import { TextGenerationWithToolsRequest } from '../../types/TextGenerationWithToolsRequest';
import { text } from './text.fn';

dotenv.config({ path: '.env.test' });
jest.mock('openai');

function setup(
  {
    maxTokens,
    messages,
    model,
  }: { maxTokens?: number; messages: ChatMessage[]; model?: string } = {
    maxTokens: 100,
    messages: [],
    model: 'gpt-4o',
  }
) {
  const stream = jest.fn();
  (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
    beta: {
      chat: {
        completions: {
          stream,
        },
      },
    },
  }));

  const request: TextGenerationWithToolsRequest = {
    model: model ?? 'gpt-4o',
    max_tokens: maxTokens,
    messages,
  };

  return { stream, request };
}

describe('text', () => {
  it('should handle user message', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];
    const { request, stream } = setup({
      messages,
    });
    stream.mockClear();

    text(request);

    expect(stream).toHaveBeenCalledWith(
      expect.objectContaining({
        messages,
      })
    );
  });
});
