import { beforeEach, describe, expect, it, vi } from 'vitest';

const registeredTools: Array<{
  name: string;
  description: string;
  invoke: (input: { query: string }) => Promise<string>;
}> = [];

const createAgentMock = vi.fn();
const toolMock = vi.fn(
  (
    impl: (input: { query: string }) => Promise<string>,
    config: { name: string; description: string },
  ) => {
    const toolInstance = { ...config, invoke: impl };
    registeredTools.push(toolInstance);
    return toolInstance;
  },
);

vi.mock('langchain', () => ({
  createAgent: createAgentMock,
  tool: toolMock,
}));

const chatOpenAIMock = vi.fn();
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: chatOpenAIMock,
}));

const memorySaverInstances: unknown[] = [];
vi.mock('@langchain/langgraph', () => ({
  MemorySaver: class MemorySaverMock {
    constructor() {
      memorySaverInstances.push(this);
    }
  },
}));

const retrieveAgentStub = { invoke: vi.fn(), stream: vi.fn() };
const airportAgentStub = { invoke: vi.fn(), stream: vi.fn() };
const weatherAgentStub = { invoke: vi.fn(), stream: vi.fn() };

vi.mock('./retrieve-agent.js', () => ({
  agent: retrieveAgentStub,
}));

vi.mock('./airport-agent.js', () => ({
  agent: airportAgentStub,
}));

vi.mock('./weather-agent.js', () => ({
  agent: weatherAgentStub,
}));

type PlanAgentConfig = {
  tools: Array<{ name: string }>;
  systemPrompt: string;
  responseFormat: {
    parse: (input: unknown) => unknown;
  };
  checkpointer?: unknown;
};

async function loadAgent() {
  return await import('./plan-agent.js');
}

function createStream<T>(chunks: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

describe('plan agent', () => {
  beforeEach(() => {
    registeredTools.length = 0;
    memorySaverInstances.length = 0;
    createAgentMock.mockReset();
    toolMock.mockClear();
    chatOpenAIMock.mockReset();
    retrieveAgentStub.invoke.mockReset();
    retrieveAgentStub.stream.mockReset();
    airportAgentStub.invoke.mockReset();
    airportAgentStub.stream.mockReset();
    weatherAgentStub.invoke.mockReset();
    weatherAgentStub.stream.mockReset();

    createAgentMock.mockReturnValue({ id: 'plan-agent-stub' });
    chatOpenAIMock.mockImplementation((options: unknown) => ({ options }));
  });

  it('creates the supervisor agent with all teammate tools registered', async () => {
    await loadAgent();

    expect(chatOpenAIMock).toHaveBeenCalledWith({
      model: 'gpt-4.1',
      temperature: 0,
      apiKey: 'test-openai-key',
    });

    const config = createAgentMock.mock.calls[0][0] as PlanAgentConfig;

    expect(config.tools.map((tool) => tool.name)).toEqual([
      'call_retrieve_agent',
      'call_airport_agent',
      'call_weather_agent',
    ]);
    expect(
      config.systemPrompt.startsWith(
        'ROLE\nYou are the flight-planning supervisor orchestrating specialized aviation agents.',
      ),
    ).toBe(true);
    expect(config.systemPrompt).toContain('CORE PRINCIPLES');
    expect(config.systemPrompt).toContain(
      'retrievals = [], airports = [], airportDistances = [], weather = []',
    );
    expect(memorySaverInstances).toHaveLength(1);
    expect(config.checkpointer).toBe(memorySaverInstances[0]);
  });

  it('validates structured supervisor responses with the schema', async () => {
    await loadAgent();
    const config = createAgentMock.mock.calls[0][0] as PlanAgentConfig;

    const validPayload = {
      decision: 'Called retrieve agent',
      resultType: 'retrieval',
      resultText: 'Response summary',
      retrievals: [
        {
          query: 'Sample query',
          results: [
            {
              collection: 'docs',
              id: 'doc-1',
              distance: 0.1,
              text: 'Document body',
              metadata: { page: 1 },
            },
          ],
        },
      ],
      airports: [],
      airportDistances: [],
      weather: [],
      flightPlan: {
        id: 'fp-123',
        rules: 'VFR',
        origin: 'KAAA',
        destination: 'KBBB',
        etd_iso: '2024-01-01T00:00:00.000Z',
        pax: 1,
        aircraft: {
          type: 'Cirrus SR22',
          tas: 180,
          fuel_burn: 12,
          weights: {
            empty: 2100,
            max_to: 3600,
            max_ldg: 3600,
          },
          moments: [],
        },
        route: {
          rules: 'VFR',
          legs: [
            {
              from: 'KAAA',
              to: 'KBBB',
              distance: 100,
            },
          ],
        },
        weather: [],
        notams: [],
        fuel: {
          total_gal: 26,
          reserve_gal: 6,
          legs: [{ legIndex: 0, gal: 20 }],
        },
      },
    };

    expect(() => config.responseFormat.parse(validPayload)).not.toThrow();
    expect(() =>
      config.responseFormat.parse({ decision: 'missing fields' }),
    ).toThrow();
  });

  it('fails validation when the flightPlan is missing or incomplete', async () => {
    await loadAgent();
    const config = createAgentMock.mock.calls[0][0] as PlanAgentConfig;

    const missingFlightPlan = {
      decision: 'Called retrieve agent',
      resultType: 'retrieval',
      resultText: 'Response summary',
      retrievals: [],
      airports: [],
      airportDistances: [],
      weather: [],
    };

    const incompleteFlightPlan = {
      ...missingFlightPlan,
      flightPlan: {
        id: 'fp-456',
        rules: 'VFR',
      },
    };

    expect(() => config.responseFormat.parse(missingFlightPlan)).toThrowError();
    expect(() =>
      config.responseFormat.parse(incompleteFlightPlan),
    ).toThrowError();
  });
  it('retries sub-agent invocation without checkpointer metadata when necessary', async () => {
    await loadAgent();

    const retrieveTool = registeredTools.find(
      (tool) => tool.name === 'call_retrieve_agent',
    );
    expect(retrieveTool).toBeDefined();

    let firstCall = true;
    retrieveAgentStub.stream.mockImplementation(
      async (_input, options?: { configurable?: { thread_id?: string } }) => {
        const threadId = options?.configurable?.thread_id;
        if (firstCall) {
          firstCall = false;
          expect(threadId).toMatch(/^plan-supervisor:retrieve:/);
          throw new Error('checkpointer unavailable');
        }
        expect(threadId).toBeUndefined();
        return createStream([]);
      },
    );

    const result = await retrieveTool!.invoke({ query: 'Need documents' });

    expect(retrieveAgentStub.stream).toHaveBeenCalledTimes(2);
    expect(result).toBe('No response.');
  });

  it('renders message content for different content shapes', async () => {
    await loadAgent();

    const retrieveTool = registeredTools.find(
      (tool) => tool.name === 'call_retrieve_agent',
    );
    expect(retrieveTool).toBeDefined();

    const responses = [
      { content: 'Simple string response' },
      { content: ['Line one', { key: 'value' }] },
      { content: { summary: 'JSON payload' } },
    ];

    retrieveAgentStub.stream.mockResolvedValueOnce(
      createStream([['messages', [{ content: responses[0].content }, {}]]]),
    );

    retrieveAgentStub.stream.mockResolvedValueOnce(
      createStream([['messages', [{ content: responses[1].content }, {}]]]),
    );

    retrieveAgentStub.stream.mockResolvedValueOnce(
      createStream([['messages', [{ content: responses[2].content }, {}]]]),
    );

    const first = await retrieveTool!.invoke({ query: 'string' });
    const second = await retrieveTool!.invoke({ query: 'array' });
    const third = await retrieveTool!.invoke({ query: 'object' });

    expect(first).toContain('Agent message:\nSimple string response');
    expect(second).toContain('Agent message:\nLine one');
    expect(second).toContain('"key": "value"');
    expect(third).toContain('"summary": "JSON payload"');
  });

  it('includes structured response output when provided by a sub-agent', async () => {
    await loadAgent();

    const weatherTool = registeredTools.find(
      (tool) => tool.name === 'call_weather_agent',
    );
    expect(weatherTool).toBeDefined();

    const structured = { weather: [{ icao: 'KSEA' }] };
    weatherAgentStub.stream.mockResolvedValue(
      createStream([
        ['updates', { structuredResponse: structured }],
        ['messages', [{ content: 'Weather data ready.' }, {}]],
      ]),
    );

    const output = await weatherTool!.invoke({ query: 'Weather please' });

    expect(output).toContain('=== STRUCTURED RESPONSE (WEATHER AGENT) ===');
    expect(output).toContain(JSON.stringify(structured, null, 2));
    expect(output).toContain('Agent message:\nWeather data ready.');
  });

  it('exports the agent returned by createAgent', async () => {
    const module = await loadAgent();
    expect(module.agent).toEqual({ id: 'plan-agent-stub' });
  });
});
