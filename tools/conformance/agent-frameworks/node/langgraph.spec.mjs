import test from 'node:test';
import assert from 'node:assert/strict';
import { runLangGraphScenario } from './langgraph.mjs';

test('real LangGraph tool execution announces START before completion', async () => {
  const scenario = await runLangGraphScenario();

  assert.equal(scenario.evidence.toolExecutions, 1);
  assert.equal(scenario.evidence.startBeforeToolCompletion, true);
  assert.equal(
    scenario.events.some((event) => event.type === 'RUN_FINISHED'),
    true,
  );
  assert.equal(
    scenario.events.find((event) => event.type === 'TOOL_CALL_RESULT').content,
    scenario.expected.calls[0].result,
  );
});

test('LangGraph exposes tool errors only in snapshots without a failed result lifecycle', async () => {
  const scenario = await runLangGraphScenario({ outcome: 'failure' });

  const snapshot = scenario.events
    .filter((event) => event.type === 'MESSAGES_SNAPSHOT')
    .at(-1);
  const failedTool = snapshot.messages.find(
    (message) => message.role === 'tool',
  );

  assert.equal(scenario.evidence.toolExecutions, 1);
  assert.equal(failedTool.error, 'error');
  assert.match(failedTool.content, /Weather service unavailable/);
  assert.equal(
    scenario.events.some((event) => event.type === 'TOOL_CALL_RESULT'),
    false,
  );
  assert.equal(
    scenario.events.some((event) => event.type === 'RUN_ERROR'),
    false,
  );
});

test('LangGraph cancellation reaches an actual blocked tool', async () => {
  const scenario = await runLangGraphScenario({ outcome: 'cancel' });

  assert.equal(scenario.evidence.toolAbortObserved, true);
  assert.equal(scenario.evidence.toolCompleted, false);
});

test('LangGraph success is reproducible with exact installed versions', async () => {
  const { semanticProjection } = await import('./capture.mjs');
  const first = await runLangGraphScenario();
  const second = await runLangGraphScenario();

  assert.deepEqual(
    semanticProjection(first.events),
    semanticProjection(second.events),
  );
  assert.deepEqual(first.versions, {
    '@ag-ui/langgraph': '0.0.45',
    '@langchain/langgraph': '1.5.3',
    '@langchain/core': '1.3.2',
    langchain: '1.6.0',
    '@ag-ui/core': '1.0.3',
  });
});
