import { randomUUID } from 'node:crypto';
import { EventType } from '@ag-ui/core';
import { DecisionResponseError, decodeDecision } from '@hashbrownai/core';
import { DecisionError } from '@hashbrownai/typesafe';
import {
  workbenchAgentSchema,
  type WorkbenchAgentTrace,
} from '../runtime/workbench-agent';
import { workbenchDecisionPlan } from '../runtime/workbench';
import type { WorkbenchWorkflowDelegate } from './workbench-workflows';
/** Real TypeSafe classifier boundary, injectable for deterministic verification. */
export type WorkbenchAgentClassifier = (options: {
  readonly request: { readonly state: string };
  readonly schema: typeof workbenchAgentSchema;
  readonly signal: AbortSignal;
}) => Promise<unknown>;
/** Wraps the existing provider stream with bounded read-only application routing for one lesson. */
export function createWorkbenchAgentStream(options: {
  readonly delegate: WorkbenchWorkflowDelegate;
  readonly classify?: WorkbenchAgentClassifier;
}): WorkbenchWorkflowDelegate {
  return async function* (input, signal, lesson) {
    if (lesson !== 'agent-decisions') {
      yield* options.delegate(input, signal, lesson);
      return;
    }
    if (signal.aborted) return;
    const user = input.messages
      .filter((message) => message.role === 'user')
      .at(-1);
    if (
      !user ||
      typeof user.content !== 'string' ||
      !user.content.trim() ||
      user.content.length > 2000
    )
      throw new Error('Invalid agent prompt');
    const identity = { threadId: input.threadId, runId: input.runId };
    yield { type: EventType.RUN_STARTED, ...identity };
    let trace: WorkbenchAgentTrace = {
      value: null,
      meta: null,
      handler: 'clarify',
      fallback: 'unavailable',
    };
    if (options.classify) {
      try {
        const response = await options.classify({
          request: { state: user.content },
          schema: workbenchAgentSchema,
          signal,
        });
        if (signal.aborted) return;
        const decision = decodeDecision(workbenchAgentSchema, response);
        const confidence = decision.meta.route.confidence;
        const valid =
          Number.isFinite(confidence) && confidence >= 0 && confidence <= 1;
        const fallback = !valid
          ? 'invalid'
          : confidence < 0.75
            ? 'low-confidence'
            : decision.value.route === 'clarify'
              ? 'clarify'
              : null;
        trace = {
          value: { route: decision.value.route },
          meta: valid ? { route: { confidence } } : null,
          handler: fallback ? 'clarify' : decision.value.route,
          fallback,
        };
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof DecisionResponseError)
          trace = { ...trace, fallback: 'invalid' };
        else if (!(error instanceof DecisionError)) throw error;
      }
    }
    if (signal.aborted) return;
    yield {
      type: EventType.CUSTOM,
      name: 'workbench.agent-decision',
      value: trace,
    };
    if (signal.aborted) return;
    const content =
      trace.handler === 'outline'
        ? `Outline handler: ${workbenchDecisionPlan.steps[0]} Choose the trusted components and explain the two-step plan.`
        : trace.handler === 'record'
          ? `Record handler: ${workbenchDecisionPlan.steps[1]} Show the prepared outline in one short demo.`
          : 'Please clarify whether you want to outline the trusted UI demo or record the prepared demo.';
    const messageId = `workbench-agent-${randomUUID()}`;
    yield { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' };
    if (signal.aborted) return;
    yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: content };
    if (signal.aborted) return;
    yield { type: EventType.TEXT_MESSAGE_END, messageId };
    if (signal.aborted) return;
    yield {
      type: EventType.RUN_FINISHED,
      ...identity,
      outcome: { type: 'success' },
      metadata: { hashbrown: { finishReason: 'stop' } },
    };
  };
}
