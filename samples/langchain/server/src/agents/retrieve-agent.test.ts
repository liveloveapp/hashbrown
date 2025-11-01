import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createAgentMock = vi.fn();
const chatOpenAIMock = vi.fn();
const memorySaverInstances: unknown[] = [];

vi.mock('langchain', () => ({
  createAgent: createAgentMock,
}));

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: chatOpenAIMock,
}));

vi.mock('@langchain/langgraph', () => ({
  MemorySaver: class MemorySaverMock {
    constructor() {
      memorySaverInstances.push(this);
    }
  },
}));

const retrieveAeronauticalTool = { name: 'mock-aero-tool' };
const retrievePohTool = { name: 'mock-poh-tool' };
vi.mock('../tools/retrieve.js', () => ({
  retrieveAeronautical: retrieveAeronauticalTool,
  retrievePoh: retrievePohTool,
}));

type AgentConfig = {
  model: unknown;
  systemPrompt: string;
  tools: unknown[];
  responseFormat: {
    parse: (input: unknown) => unknown;
  };
  checkpointer?: unknown;
};

type RetrieveAgentModule = {
  agent: unknown;
};

async function loadAgent(): Promise<RetrieveAgentModule> {
  return await import('./retrieve-agent.js');
}

const ORIGINAL_OPENAI_API_KEY = process.env.OPENAI_API_KEY;

describe('retrieve agent', () => {
  beforeEach(() => {
    createAgentMock.mockReset();
    chatOpenAIMock.mockReset();
    memorySaverInstances.length = 0;
    createAgentMock.mockReturnValue({ id: 'agent-stub' });
    chatOpenAIMock.mockImplementation((options: unknown) => ({ options }));
    process.env.OPENAI_API_KEY = 'test-openai-key';
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_API_KEY;
  });

  it('constructs ChatOpenAI with the expected configuration', async () => {
    await loadAgent();

    expect(chatOpenAIMock).toHaveBeenCalledWith({
      model: 'gpt-4.1',
      temperature: 0,
      apiKey: 'test-openai-key',
    });
  });

  it('creates an agent with the retrieval tool and trimmed system prompt', async () => {
    await loadAgent();

    const config = createAgentMock.mock.calls[0][0] as AgentConfig;

    expect(config.tools).toEqual([retrieveAeronauticalTool, retrievePohTool]);
    expect(
      config.systemPrompt.startsWith(
        'ROLE\nYou are an aeronautical document retrieval specialist.',
      ),
    ).toBe(true);
    expect(
      config.systemPrompt.includes(
        "- PHAK (Pilot's Handbook of Aeronautical Knowledge): VITAL for flight planning fundamentals",
      ),
    ).toBe(true);
    expect(
      config.systemPrompt.includes(
        "- POH (Pilot's Operating Handbook): Aircraft-specific data",
      ),
    ).toBe(true);
    expect(
      config.systemPrompt.includes(
        'Include a numeric `k` argument—default to 5 unless the user requests otherwise.',
      ),
    ).toBe(true);
    expect(config.systemPrompt.trim().endsWith('cited sources.')).toBe(true);
  });

  it('attaches a MemorySaver instance as the checkpointer', async () => {
    await loadAgent();

    const config = createAgentMock.mock.calls[0][0] as AgentConfig;

    expect(memorySaverInstances).toHaveLength(1);
    expect(config.checkpointer).toBe(memorySaverInstances[0]);
  });

  it('exposes a response format schema that validates retrieval payloads', async () => {
    await loadAgent();

    const config = createAgentMock.mock.calls[0][0] as AgentConfig;

    const validPayload = {
      query: 'What is LangChain?',
      results: [
        {
          collection: 'docs',
          id: '123',
          distance: 0.2,
          text: 'LangChain is a framework...',
          metadata: { page: '12' },
        },
      ],
    };

    expect(() => config.responseFormat.parse(validPayload)).not.toThrow();
    expect(() =>
      config.responseFormat.parse({ query: 'missing results' }),
    ).toThrow();
  });

  it('exports the agent returned from createAgent', async () => {
    const module = await loadAgent();

    expect(module.agent).toEqual({ id: 'agent-stub' });
  });
});
