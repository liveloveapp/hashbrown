import { MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { next } from '../edges/next.js';
import { GraphStateSchema } from '../models/state.js';
import { airport } from '../nodes/airport.js';
import { phak } from '../nodes/phak.js';
import { poh } from '../nodes/poh.js';
import { router } from '../nodes/router.js';
import { weather } from '../nodes/weather.js';

const PATH_MAP = {
  airport: 'airport' as const,
  phak: 'phak' as const,
  poh: 'poh' as const,
  weather: 'weather' as const,
  __end__: '__end__' as const,
};

function createStateGraph() {
  return new StateGraph(GraphStateSchema)
    .addNode('airport', airport)
    .addNode('phak', phak)
    .addNode('poh', poh)
    .addNode('router', router)
    .addNode('weather', weather)
    .addEdge(START, 'router')
    .addEdge('airport', 'router')
    .addEdge('phak', 'router')
    .addEdge('poh', 'router')
    .addEdge('weather', 'router')
    .addConditionalEdges('router', next, PATH_MAP);
}

const checkpointer = new MemorySaver();

export const graph = createStateGraph().compile({
  checkpointer,
});

graph.name = 'Plan Agent';
