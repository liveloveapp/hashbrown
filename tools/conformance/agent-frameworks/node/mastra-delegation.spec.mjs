import test from 'node:test';
import assert from 'node:assert/strict';
import { runMastraDelegationScenario } from './mastra-delegation.mjs';

test('Mastra native agent delegation executes its child without AG-UI child attribution', async () => {
  const run = runMastraDelegationScenario;

  const scenario = await run();
  const calls = scenario.events.filter(
    (event) => event.type === 'TOOL_CALL_START',
  );

  assert.equal(scenario.evidence.childModelExecutions, 1);
  assert.equal(scenario.evidence.parentModelExecutions, 2);
  const result = scenario.events.find(
    (event) => event.type === 'TOOL_CALL_RESULT',
  );
  assert.equal(JSON.parse(result.content).text, scenario.expected.text);
  assert.equal(typeof JSON.parse(result.content).subAgentThreadId, 'string');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].toolCallName, 'agent-worker');
  assert.equal(
    scenario.events.some((event) => event.type.startsWith('SUBAGENT_')),
    false,
  );
  assert.equal(
    scenario.events.some((event) => Object.hasOwn(event, 'subagentRunId')),
    false,
  );
  assert.ok(scenario.events.some((event) => event.type === 'RUN_FINISHED'));
  assert.equal(
    scenario.events.some((event) => event.type === 'RUN_ERROR'),
    false,
  );
});
