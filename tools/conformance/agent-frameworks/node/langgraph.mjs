import {
  StateGraph,
  MemorySaver,
  MessagesAnnotation,
  START,
  END,
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  AIMessageChunk,
  HumanMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import { LangGraphAgent } from '@ag-ui/langgraph';
import { captureScenario, installedVersions, answerText } from './scenario.mjs';

/** Deterministic model whose native callbacks are emitted by LangChain itself. */
class WeatherModel extends BaseChatModel {
  _llmType() {
    return 'conformance-weather';
  }
  async _generate(messages, options, runManager) {
    const generations = [];
    for await (const chunk of this._streamResponseChunks(
      messages,
      options,
      runManager,
    ))
      generations.push(chunk);
    return { generations };
  }
  async *_streamResponseChunks(messages, _options, runManager) {
    const hasResult = messages.at(-1)?._getType() === 'tool';
    const message = hasResult
      ? new AIMessageChunk({ id: 'weather-answer', content: answerText })
      : new AIMessageChunk({
          id: 'weather-assistant',
          content: '',
          tool_call_chunks: [
            {
              name: 'getWeather',
              args: '{"city":"Paris"}',
              id: 'weather-call',
              index: 0,
              type: 'tool_call_chunk',
            },
          ],
        });
    const chunk = new ChatGenerationChunk({
      message,
      text: hasResult ? answerText : '',
    });
    await runManager?.handleLLMNewToken(
      chunk.text,
      undefined,
      undefined,
      undefined,
      undefined,
      { chunk },
    );
    yield chunk;
  }
}

/** Runs the published bridge over actual graph events using a labeled in-process SDK seam. */
export async function runLangGraphScenario({
  outcome = 'success',
  profile = 'local-sdk-seam',
} = {}) {
  if (
    !['local-sdk-seam', 'native-subgraph', 'native-progress'].includes(profile)
  )
    throw new Error(`Unknown LangGraph profile: ${profile}`);
  let nativeSubgraphObserved = false;
  const scenario = await captureScenario(
    async (execute) => {
      const weather = tool(
        async (args, config) => {
          if (profile === 'native-progress')
            await dispatchCustomEvent(
              'weather-progress',
              { status: 'running' },
              config,
            );
          const content = await execute(args, { signal: config.signal });
          if (profile === 'native-progress')
            await dispatchCustomEvent(
              'weather-progress',
              { status: 'completed' },
              config,
            );
          return new ToolMessage({
            id: 'weather-result',
            content,
            tool_call_id: 'weather-call',
            name: 'getWeather',
          });
        },
        {
          name: 'getWeather',
          description: 'Get weather for a city',
          schema: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
            additionalProperties: false,
          },
        },
      );
      const model = new WeatherModel({});
      const worker = new StateGraph(MessagesAnnotation)
        .addNode('weather', async (state, config) => {
          nativeSubgraphObserved = true;
          return new ToolNode([weather]).invoke(state, config);
        })
        .addEdge(START, 'weather')
        .addEdge('weather', END)
        .compile({ name: 'weather-worker' });
      const graph = new StateGraph(MessagesAnnotation)
        .addNode('model', async ({ messages }) => {
          let result;
          for await (const chunk of await model.stream(messages))
            result = result ? result.concat(chunk) : chunk;
          return { messages: [result] };
        })
        .addNode(
          'tools',
          profile === 'native-subgraph' ? worker : new ToolNode([weather]),
        )
        .addEdge(START, 'model')
        .addConditionalEdges('model', ({ messages }) =>
          messages.at(-1).tool_calls?.length ? 'tools' : END,
        )
        .addEdge('tools', 'model')
        .compile(
          profile === 'native-subgraph'
            ? { checkpointer: new MemorySaver() }
            : {},
        );
      const controller = new AbortController();
      let state = { values: { messages: [] }, next: [], tasks: [] };
      const client = {
        assistants: {
          search: async () => [
            { graph_id: 'weather', assistant_id: 'weather', config: {} },
          ],
          getGraph: async () => ({
            nodes: [{ id: 'model' }, { id: 'tools' }],
            edges: [{ source: 'model', target: 'tools' }],
          }),
          getSchemas: async () => ({}),
        },
        threads: {
          get: async (threadId) => ({ thread_id: threadId }),
          getState: async () => state,
          async getHistory(threadId, options) {
            const history = [];
            for await (const checkpoint of graph.getStateHistory(
              { configurable: { thread_id: threadId } },
              { filter: options.metadata, limit: options.limit },
            ))
              history.push(checkpoint);
            return history;
          },
        },
        runs: {
          cancel: async () => {
            controller.abort();
          },
          async *stream(threadId, _assistantId, payload) {
            const messages = payload.input.messages.map(
              (message) =>
                new HumanMessage({ id: message.id, content: message.content }),
            );
            try {
              for await (const event of graph.streamEvents(
                { messages },
                {
                  version: 'v2',
                  signal: controller.signal,
                  configurable: { thread_id: threadId },
                },
              )) {
                if (
                  event.event === 'on_chain_end' &&
                  event.name === 'LangGraph'
                ) {
                  state = { values: event.data.output, next: [], tasks: [] };
                }
                // Transport wrapping only: the native event is never rewritten.
                yield { event: 'events', data: event };
              }
            } catch (error) {
              if (!controller.signal.aborted) throw error;
            }
          },
        },
      };
      return new LangGraphAgent({
        graphId: 'weather',
        client,
        emitRawEvents: false,
      });
    },
    {
      live: true,
      framework: 'langgraph',
      profile,
      versions: installedVersions([
        '@ag-ui/langgraph',
        '@langchain/langgraph',
        '@langchain/core',
        'langchain',
        '@ag-ui/core',
      ]),
      outcome,
      transport:
        'in-process LangGraph SDK Client seam backed by real graph.streamEvents; no API server',
    },
  );
  return {
    ...scenario,
    evidence: { ...scenario.evidence, nativeSubgraphObserved },
  };
}
