import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { buildStaticRouteModule } from '@b4run/cli/fetch';
import { agent, type B4ToolContext } from '@b4run/sdk';

/** Builds the fixed native agent route with one server-owned approval-gated tool. */
export function createProductionRoute(
  acceptPlan: (input: unknown, ctx: B4ToolContext) => Promise<unknown>,
  model = 'gpt-4.1-mini',
) {
  // B4 caches prepared modules by routeFile. Give each embedding its own cache identity so tool closures retain its request fence.
  const instanceDirectory = resolve(
    'www/examples/quickstart/server/production',
    '.instances',
    randomUUID(),
  );
  const routeFile = resolve(instanceDirectory, 'agent.ts');
  return buildStaticRouteModule({
    kind: 'agent',
    stateDefaults: [
      ['revision', 0],
      ['plan', null],
    ],
    routeId: '/recording-plan-v1',
    routePath: 'agent.ts',
    routeFile,
    routeModule: {
      default: agent({
        model,
        provider: 'openai',
        maxOutputTokens: 600,
        retry: { maxAttempts: 1 },
        tools: {
          allow: ['acceptPlan'],
          approve: [{ tool: 'acceptPlan', allowAlways: false }],
        },
        systemPrompt:
          'You prepare a fixed recording plan: Outline the demo; Record the demo. When the user asks for a plan, you MUST immediately invoke acceptPlan exactly once with empty arguments. Never ask for approval in prose. Calling acceptPlan only proposes the plan: the runtime presents the human approval prompt and pauses BEFORE executing the action. Do not wait for the user to type approval before calling this tool. Do not claim acceptance before the tool succeeds. If the user declines the runtime prompt, respect that decision.',
      }),
    },
    tools: [
      {
        name: 'acceptPlan',
        scope: 'route-local',
        filePath: resolve(instanceDirectory, 'acceptPlan.ts'),
        module: {
          description:
            'Propose the fixed two-step recording plan. Call immediately when asked for a plan; the runtime will pause and ask the human for approval before applying it. No arguments.',
          schema: {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false,
          },
          returnDirect: true,
          default: acceptPlan,
        },
      },
    ],
  });
}
