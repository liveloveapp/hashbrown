import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAgentMock = vi.fn();
const chatOpenAIMock = vi.fn();

vi.mock('langchain', () => ({
  createAgent: createAgentMock,
}));

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: chatOpenAIMock,
}));

const getMetarTool = { name: 'mock-get-metar' };
vi.mock('../tools/get_metar.js', () => ({
  getMetar: getMetarTool,
}));

type WeatherAgentConfig = {
  model: unknown;
  systemPrompt: string;
  tools: unknown[];
  responseFormat: {
    parse: (input: unknown) => unknown;
  };
};

async function loadAgent() {
  return await import('./weather-agent.js');
}

describe('weather agent', () => {
  beforeEach(() => {
    createAgentMock.mockReset();
    chatOpenAIMock.mockReset();
    createAgentMock.mockReturnValue({ id: 'weather-agent-stub' });
    chatOpenAIMock.mockImplementation((options: unknown) => ({ options }));
  });

  it('creates the language model with the expected configuration', async () => {
    await loadAgent();

    expect(chatOpenAIMock).toHaveBeenCalledWith({
      model: 'gpt-4.1',
      temperature: 0,
      apiKey: 'test-openai-key',
    });
  });

  it('registers the get_metar tool and aviation weather system prompt', async () => {
    await loadAgent();

    const config = createAgentMock.mock.calls[0][0] as WeatherAgentConfig;

    expect(config.tools).toEqual([getMetarTool]);
    expect(
      config.systemPrompt.includes('You are an aviation weather expert.'),
    ).toBe(true);
    expect(config.systemPrompt).toContain(
      'Step 1: Extract the ICAO airport code',
    );
  });

  it('exposes a WeatherResponse schema that validates structured output', async () => {
    await loadAgent();

    const config = createAgentMock.mock.calls[0][0] as WeatherAgentConfig;

    const validPayload = {
      weather: [
        {
          icao: 'KBDN',
          metar: 'METAR KBDN 010000Z 00000KT 10SM CLR 00/M02 A2992',
          taf: 'TAF KBDN 0100/0112 03005KT P6SM SKC',
          ceiling_ft: null,
          visibility_sm: 10,
          wind_dir_deg: 0,
          wind_spd_kt: 0,
          hazards: null,
        },
      ],
    };

    expect(() => config.responseFormat.parse(validPayload)).not.toThrow();
    expect(() =>
      config.responseFormat.parse({ weather: [{ icao: 'KBDN' }] }),
    ).toThrow();
  });

  it('exports the agent returned from createAgent', async () => {
    const module = await loadAgent();
    expect(module.agent).toEqual({ id: 'weather-agent-stub' });
  });
});
