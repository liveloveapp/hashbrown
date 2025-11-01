import { MemorySaver } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { createAgent, tool } from 'langchain';
import { z, ZodType } from 'zod';
import type { LangGraphRunnableConfig, StreamMode } from '@langchain/langgraph';
import { agent as airportAgent } from './airport-agent.js';
import { agent as retrieveAgent } from './retrieve-agent.js';
import { agent as weatherAgent } from './weather-agent.js';
import {
  Airport,
  AirportDistance,
  FlightPlan,
  WeatherSegment,
} from '../models/state.js';

const RetrievalResult = z.object({
  collection: z.string(),
  id: z.string(),
  distance: z.number().nullable(),
  text: z.string(),
  metadata: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .nullable(),
});

const Retrieval = z.object({
  query: z.string().describe('The query used for this retrieval'),
  results: z.array(RetrievalResult),
});

type FlightPlanType = z.infer<typeof FlightPlan>;

const FlightPlanResponse: ZodType<FlightPlanType> = z.object({
  id: z.string(),
  rules: z.enum(['VFR', 'IFR']),
  origin: z.string(),
  destination: z.string(),
  etd_iso: z.string(),
  pax: z.number(),
  aircraft: z.object({
    type: z.string(),
    tas: z.number(),
    fuel_burn: z.number(),
    weights: z.object({
      empty: z.number(),
      max_to: z.number(),
      max_ldg: z.number(),
    }),
    moments: z.array(
      z.object({
        name: z.string(),
        value: z.number(),
      }),
    ),
  }),
  route: z.object({
    rules: z.enum(['VFR', 'IFR']),
    legs: z.array(
      z.object({
        from: z.string(),
        to: z.string(),
        distance: z.number(),
      }),
    ),
  }),
  weather: z.array(
    z.object({
      icao: z.string(),
      metar: z.string(),
      taf: z.string().nullable(),
      ceiling_ft: z.number().nullable(),
      visibility_sm: z.number().nullable(),
      wind_dir_deg: z.number().nullable(),
      wind_spd_kt: z.number().nullable(),
      hazards: z
        .array(z.enum(['icing', 'ts', 'llws', 'ifr', 'mvfr']))
        .nullable(),
    }),
  ),
  notams: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      start: z.string(),
      end: z.string(),
      geometry: z
        .record(
          z.string(),
          z.union([z.string(), z.number(), z.boolean(), z.null()]),
        )
        .nullable(),
      kind: z.enum(['RWY', 'NAV', 'TFR', 'SUA', 'OTHER']),
    }),
  ),
  fuel: z.object({
    total_gal: z.number(),
    reserve_gal: z.number(),
    legs: z.array(
      z.object({
        legIndex: z.number(),
        gal: z.number(),
      }),
    ),
  }),
}) as unknown as ZodType<FlightPlanType>;

const SupervisorResponse = z.object({
  decision: z.string().describe('What route the supervisor took and why'),
  resultType: z
    .enum(['retrieval', 'airport', 'weather', 'general'])
    .describe('Type of result'),
  resultText: z.string().describe('Concise user-facing answer'),
  retrievals: z
    .array(Retrieval)
    .describe(
      'Array of retrieval results, one for each call_retrieve_agent invocation. Each retrieval maintains its original query and results separately.',
    ),
  airports: z.array(Airport),
  airportDistances: z.array(AirportDistance),
  weather: z.array(WeatherSegment),
  flightPlan: FlightPlanResponse.describe(
    'Complete synthesized flight plan constructed from collected data.',
  ),
});

function renderMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => renderMessageContent(part))
      .filter(Boolean)
      .join('\n');
  }

  if (content && typeof content === 'object') {
    return JSON.stringify(content, null, 2);
  }

  return '';
}

type AgentStreamConfig = LangGraphRunnableConfig & {
  writer?: (chunk: unknown) => void | Promise<void>;
  streamMode?: StreamMode | StreamMode[];
};

async function invokeSubAgent(
  subAgent: ReturnType<typeof createAgent>,
  query: string,
  agentName: string,
  config?: AgentStreamConfig,
): Promise<string> {
  const invokeInput = {
    messages: [
      {
        role: 'user' as const,
        content: query,
      },
    ],
  };

  const writer = config?.writer;
  const emit = async (event: unknown) => {
    if (!writer) {
      return;
    }
    await Promise.resolve(writer(event));
  };

  await emit({
    type: 'subagent:start',
    agent: agentName,
    query,
  });

  const threadId = `plan-supervisor:${agentName}:${Date.now().toString(36)}`;

  const streamConfig: AgentStreamConfig = {
    ...config,
    configurable: {
      ...(config?.configurable ?? {}),
      thread_id: threadId,
    },
    streamMode: ['updates', 'messages'],
  };

  let stream;
  try {
    stream = await subAgent.stream(invokeInput, streamConfig);
  } catch (configError) {
    if (
      configError instanceof Error &&
      configError.message.includes('checkpointer')
    ) {
      const fallbackConfig: AgentStreamConfig = {
        ...config,
        streamMode: ['updates', 'messages'],
      };
      stream = await subAgent.stream(invokeInput, fallbackConfig);
    } else {
      await emit({
        type: 'subagent:error',
        agent: agentName,
        message:
          configError instanceof Error
            ? configError.message
            : String(configError),
      });
      throw configError;
    }
  }

  if (!stream) {
    await emit({
      type: 'subagent:complete',
      agent: agentName,
      result: 'no-stream',
    });
    return 'No response.';
  }

  let structured: unknown = null;
  let finalText = '';
  const sections: string[] = [];

  const extractStructured = (candidate: unknown) => {
    if (
      candidate &&
      typeof candidate === 'object' &&
      'structuredResponse' in candidate &&
      (candidate as { structuredResponse: unknown }).structuredResponse !==
        undefined
    ) {
      structured = (candidate as { structuredResponse: unknown })
        .structuredResponse;
    }
  };

  const handleUpdatePayload = (payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    extractStructured(payload);

    for (const value of Object.values(payload as Record<string, unknown>)) {
      extractStructured(value);
    }
  };

  const toRenderableContent = (messageContent: unknown) => {
    const rendered = renderMessageContent(messageContent);
    if (rendered) {
      finalText = rendered;
    }
  };

  for await (const chunk of stream as AsyncIterable<unknown>) {
    if (Array.isArray(chunk) && chunk.length >= 2) {
      const [mode, payload] = chunk as [string, unknown];

      if (mode === 'updates') {
        await emit({
          type: 'subagent:update',
          agent: agentName,
          payload,
        });
        handleUpdatePayload(payload);
        continue;
      }

      if (mode === 'messages') {
        await emit({
          type: 'subagent:message',
          agent: agentName,
          payload,
        });
        if (
          Array.isArray(payload) &&
          payload.length > 0 &&
          payload[0] &&
          typeof payload[0] === 'object' &&
          'content' in payload[0]
        ) {
          toRenderableContent((payload[0] as { content: unknown }).content);
        }
        continue;
      }
    }

    await emit({
      type: 'subagent:chunk',
      agent: agentName,
      chunk,
    });
  }

  if (structured) {
    sections.push(
      `=== STRUCTURED RESPONSE (${agentName.toUpperCase()} AGENT) ===\n${JSON.stringify(structured, null, 2)}\n=== END STRUCTURED RESPONSE ===`,
    );
  }

  if (finalText) {
    sections.push(`Agent message:\n${finalText}`);
  }

  await emit({
    type: 'subagent:complete',
    agent: agentName,
    structured,
    message: finalText,
  });

  return sections.join('\n\n') || 'No response.';
}

const callRetrieveAgent = tool(
  async ({ query }: { query: string }, config?: AgentStreamConfig) => {
    return invokeSubAgent(retrieveAgent, query, 'retrieve', config);
  },
  {
    name: 'call_retrieve_agent',
    description:
      'Call the document retrieval agent to search the PHAK (Pilot’s Handbook of Aeronautical Knowledge) and POH (Pilot’s Operating Handbook) collections for authoritative passages. Include cues like "PHAK:" or "POH:" in your query to steer the retrieval.',
    schema: z.object({
      query: z
        .string()
        .describe(
          'User query or search terms to retrieve from the document collections.',
        ),
    }),
  },
);

const callAirportAgent = tool(
  async ({ query }: { query: string }, config?: AgentStreamConfig) => {
    return invokeSubAgent(airportAgent, query, 'airport', config);
  },
  {
    name: 'call_airport_agent',
    description:
      'Call the aviation airport information agent to look up airport details by ICAO, IATA, or FAA code.',
    schema: z.object({
      query: z
        .string()
        .describe(
          'Question or request that requires airport information (e.g., ICAO/IATA/FAA codes).',
        ),
    }),
  },
);

const callWeatherAgent = tool(
  async ({ query }: { query: string }, config?: AgentStreamConfig) => {
    return invokeSubAgent(weatherAgent, query, 'weather', config);
  },
  {
    name: 'call_weather_agent',
    description:
      'Call the aviation weather agent to obtain METAR or other flight weather information.',
    schema: z.object({
      query: z
        .string()
        .describe(
          'Question or request that needs aviation weather or METAR information.',
        ),
    }),
  },
);

const supervisorPrompt = `
ROLE
You are the flight-planning supervisor orchestrating specialized aviation agents. You ensure every response reflects authoritative guidance.

CORE PRINCIPLES
- PHAK (Pilot's Handbook of Aeronautical Knowledge) is VITAL for planning questions: regulations, fuel reserves, navigation procedures, weight and balance, and weather theory.
- POH (Pilot's Operating Handbook) provides aircraft-specific limitations, systems information, and performance data. Use it when the question references a particular aircraft.
- Use the retrieval agent FIRST for planning-focused queries so the answer is grounded in PHAK/POH before consulting other agents.
- After confirming the planning regulations, you MUST enrich the answer with POH data. If the user does not name an aircraft, default to the Cirrus SR22 POH (the only available POH in this workspace) and clearly note the assumption.

TOOLS
- call_retrieve_agent — Search PHAK and POH collections. Default to PHAK for planning fundamentals; include a POH follow-up if aircraft-specific data is needed.
- call_airport_agent — Airport identifiers, facilities, runways, and distance calculations.
- call_weather_agent — Current METAR/TAF and aviation weather details for specified locations.

WORKFLOW
1. Parse the user's request. If it involves planning procedures, regulations, or calculations, immediately call call_retrieve_agent with a PHAK-focused query (prefix it with "PHAK:" plus the topic) to capture regulatory guidance.
2. Follow up with another call to call_retrieve_agent targeting the POH (prefix with "POH:" and include the aircraft model if known; otherwise default to the Cirrus SR22 and document the assumption) to obtain aircraft-specific numbers or procedures.
3. After retrieval, call call_airport_agent for airport data only if the question needs field elevations, runway info, alternates, etc.
4. Call call_weather_agent for current or forecast conditions impacting the route.
5. When aircraft specifics remain unresolved, run a clarifying POH retrieval before finalizing the answer.
6. Combine the retrieved findings into a cohesive answer citing the sources provided by each agent. Clearly distinguish PHAK vs POH insights, and ensure you never cite POH data unless it appears in the results of one of the retrievals in the retrievals array.

FLIGHT PLAN CONSTRUCTION (MANDATORY)
- Every response MUST include a complete FlightPlan object.
- Generate a unique flightPlan.id (for example fp-<timestamp>).
- Derive flightPlan.rules from query context (detect IFR terminology); default to VFR when uncertain.
- Determine flightPlan.origin and flightPlan.destination from the user query; if absent, infer from airport data (treat the first airport as the origin and the last as the destination).
- Set flightPlan.etd_iso to the provided departure time or fall back to the current ISO timestamp.
- Set flightPlan.pax from user input or default to 1.
- Populate flightPlan.aircraft with the provided aircraft data and POH. If no aircraft specified, use the Cirrus SR22.
- Build flightPlan.route using airportDistances: create one Leg per distance entry (from/to/distance) and mirror the overall rules.
- Set flightPlan.weather to the collected weather segments (filtered to the route airports when possible).
- Set flightPlan.notams to [] (no NOTAM source available yet).
- Compute flightPlan.fuel as follows:
  - Total distance = sum of route legs.
  - Cruise time = distance / aircraft.tas.
  - Cruise fuel = cruise time * aircraft.fuel_burn.
  - Reserve fuel = max(cruise fuel * 0.1, 0.5 * aircraft.fuel_burn) for VFR; use 0.75 * aircraft.fuel_burn if IFR.
  - Total fuel = cruise fuel + reserve fuel.
  - Populate fuel.legs with per-leg consumption (leg distance / tas * fuel_burn).

EXAMPLE WORKFLOW
Query: "What is the fuel requirement for a flight from KBDM to KPDX today?"
1. call_retrieve_agent → query "PHAK: VFR fuel reserve requirements" to capture planning regulations.
2. call_retrieve_agent → query "POH Cirrus SR22 fuel system capacities and reserves" (or the specific aircraft mentioned) to add aircraft fuel data, noting any assumptions.
3. call_airport_agent → gather airport details (distances, runway data) for contextual planning.
4. call_weather_agent → obtain METAR/forecast for both airports to discuss today's conditions.
5. Construct the FlightPlan fields (IDs, origin/destination, Cirrus defaults, route legs, fuel, weather, empty NOTAMs) before finalizing the response.

STRUCTURED RESPONSE REQUIREMENTS
- Each sub-agent returns a "Structured response" JSON block. You MUST extract and populate the SupervisorResponse fields.
- Retrieval: For each call to call_retrieve_agent, extract the structured response which contains a "query" and "results" array. Add each retrieval as a separate object in the "retrievals" array, preserving each retrieval's original query and results. Maintain the order of retrievals based on the order of calls. If no POH retrieval is present when an aircraft-specific answer is required, run another POH retrieval before responding.
- Airport: populate "airports" and "airportDistances" arrays.
- Weather: populate the "weather" array.
- Flight plan: populate "flightPlan" with valid data following the instructions above. Never leave it null or incomplete.
- Always include these fields. If no data exists, use empty structures (retrievals = [], airports = [], airportDistances = [], weather = [], notams = []) and still construct a sensible FlightPlan using defaults.
`;

const supervisorModel = new ChatOpenAI({
  model: 'gpt-4.1',
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
});

const supervisorCheckpointer = new MemorySaver();

export const agent = createAgent({
  model: supervisorModel,
  systemPrompt: supervisorPrompt.trim(),
  tools: [callRetrieveAgent, callAirportAgent, callWeatherAgent],
  responseFormat: SupervisorResponse,
  checkpointer: supervisorCheckpointer,
});
