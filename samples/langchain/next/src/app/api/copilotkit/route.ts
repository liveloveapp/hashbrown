import {
  CopilotRuntime,
  createCopilotEndpointSingleRoute,
  InMemoryAgentRunner,
} from '@copilotkitnext/runtime';
import { handle } from 'hono/vercel';
import { LangGraphAgent } from '@ag-ui/langgraph';

const singleRuntime = new CopilotRuntime({
  agents: {
    plan: new LangGraphAgent({
      deploymentUrl: 'http://localhost:2024',
      graphId: 'plan',
    }) as any,
  },
  runner: new InMemoryAgentRunner(),
});

const app = createCopilotEndpointSingleRoute({
  runtime: singleRuntime,
  basePath: '/api/copilotkit',
});

export const POST = handle(app);
