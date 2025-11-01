import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const getAirportTool = { name: 'mock-get-airport' };
vi.mock('../tools/get_airport.js', () => ({
  getAirport: getAirportTool,
}));

const calcDistanceTool = { name: 'mock-calc-distance' };
vi.mock('../tools/calc_distance.js', () => ({
  calcDistance: calcDistanceTool,
}));

type AgentConfig = {
  systemPrompt: string;
  tools: unknown[];
  responseFormat: {
    parse: (input: unknown) => unknown;
  };
  checkpointer?: unknown;
};

async function loadAgent() {
  return await import('./airport-agent.js');
}

describe('airport agent', () => {
  beforeEach(() => {
    createAgentMock.mockReset();
    chatOpenAIMock.mockReset();
    memorySaverInstances.length = 0;
    createAgentMock.mockReturnValue({ id: 'airport-agent-stub' });
    chatOpenAIMock.mockImplementation((options: unknown) => ({ options }));
  });

  it('initializes ChatOpenAI with expected defaults', async () => {
    await loadAgent();

    expect(chatOpenAIMock).toHaveBeenCalledWith({
      model: 'gpt-4.1',
      temperature: 0,
      apiKey: 'test-openai-key',
    });
  });

  it('configures the agent with both get_airport and calc_distance tools', async () => {
    await loadAgent();

    const config = createAgentMock.mock.calls[0][0] as AgentConfig;

    expect(config.tools).toEqual([getAirportTool, calcDistanceTool]);
    expect(config.systemPrompt).toContain(
      'You are an aviation airport information expert.',
    );
    expect(config.systemPrompt).toContain('get_airport');
    expect(config.systemPrompt).toContain('calc_distance');
    expect(config.systemPrompt).toContain('distance between');
    expect(config.systemPrompt).toContain(
      'returns an object shaped like { "airports": [ ... ] }',
    );
    expect(config.systemPrompt).toContain(
      '"distances" array in your structured response',
    );
  });

  it('includes instructions for extracting multiple airport codes', async () => {
    await loadAgent();

    const config = createAgentMock.mock.calls[0][0] as AgentConfig;

    expect(config.systemPrompt).toContain(
      "Extract all airport codes from the user's query",
    );
    expect(config.systemPrompt).toContain('comma-separated codes');
  });

  it('uses a MemorySaver checkpointer for conversation state', async () => {
    await loadAgent();

    const config = createAgentMock.mock.calls[0][0] as AgentConfig;

    expect(memorySaverInstances).toHaveLength(1);
    expect(config.checkpointer).toBe(memorySaverInstances[0]);
  });

  it('validates airport responses with the zod schema', async () => {
    await loadAgent();

    const config = createAgentMock.mock.calls[0][0] as AgentConfig;

    const valid = {
      airports: [
        {
          icaoId: 'KMCI',
          iataId: 'MCI',
          faaId: 'MCI',
          name: 'Kansas City Intl',
          state: 'MO',
          country: 'US',
          source: 'FAA',
          type: 'Airport',
          lat: '39.297',
          lon: '-94.714',
          elev: '1026',
          magdec: '2E',
          owner: 'City',
          runways: null,
        },
      ],
      distances: [
        {
          from: 'KMCI',
          to: 'KJFK',
          distance_nm: 1000,
        },
      ],
    };

    expect(() => config.responseFormat.parse(valid)).not.toThrow();
    expect(() =>
      config.responseFormat.parse({
        airports: [{ name: 'Missing ICAO' }],
        distances: [],
      }),
    ).toThrow();
  });

  it('exports the agent provided by createAgent', async () => {
    const module = await loadAgent();
    expect(module.agent).toEqual({ id: 'airport-agent-stub' });
  });
});
