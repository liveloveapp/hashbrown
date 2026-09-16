import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type {
  DecisionResult,
  Proposal,
  ProposalRequest,
} from '@invoicing/contracts';
import type { SessionStore } from './session-store';

/** Server-only bearer capability; never serialize this context to the browser. */
export interface ReviewContext {
  readonly token: string;
  readonly sessionId: string;
  readonly threadId: string;
  readonly selectedPaymentId: string;
  readonly selectedInvoiceId?: string;
  readonly generation: number;
  readonly responseSchema: unknown;
  readonly decision: 'initial' | 'once' | 'cancelled';
}

/** Authorization and authoritative proposal operations for a review thread. */
export interface ReviewCoordinator {
  /** Validate an untrusted request without performing financial mutations. */
  authorize(sessionId: string, body: unknown): ReviewContext;
  /** Prepare one immutable allocation during an initial run. */
  prepare(context: ReviewContext, request: ProposalRequest): Proposal;
  /** Apply a stored proposal after B4 separately validates the pending interrupt. */
  apply(context: ReviewContext, proposalId: string): DecisionResult;
  /** Read a proposal only from its owning session and thread. */
  getProposal(sessionId: string, threadId: string): Proposal;
}

interface Binding {
  readonly sessionId: string;
  readonly threadId: string;
  readonly selectedPaymentId: string;
  readonly selectedInvoiceId?: string;
  readonly generation: number;
  readonly proposalId?: string;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 256;

const freeze = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (typeof value !== 'object' || value === null || seen.has(value))
    return value;
  seen.add(value);
  Object.values(value).forEach((child) => freeze(child, seen));
  return Object.freeze(value);
};

/**
 * Create an in-memory guard using opaque server-only capabilities.
 *
 * A once payload is only a requested decision. The B4 runtime must validate its
 * actual pending interrupt before calling apply; this guard cannot prove that.
 * Run IDs are validated as transport identifiers; authority is scoped to the
 * thread and its one immutable proposal, so a new run does not create a grant.
 * Capabilities are reused with at most three per thread. Old bindings remain
 * tombstones so reset cannot let an old thread claim a new session.
 */
export function createReviewCoordinator(
  store: SessionStore,
  expectedResponseSchema: unknown,
): ReviewCoordinator {
  const responseSchema = freeze(structuredClone(expectedResponseSchema));
  const bindings = new Map<string, Binding>();
  const capabilities = new Map<string, ReviewContext>();
  const tokens = new Map<
    string,
    Partial<Record<ReviewContext['decision'], string>>
  >();

  const current = (sessionId: string, threadId: string): Binding => {
    const generation = store.generation(sessionId);
    const binding = bindings.get(threadId);
    if (!binding) throw new Error('thread_not_found');
    if (binding.sessionId !== sessionId)
      throw new Error('thread_binding_conflict');
    if (binding.generation !== generation) throw new Error('stale_generation');
    return binding;
  };
  const resolve = (
    context: ReviewContext,
  ): { grant: ReviewContext; binding: Binding } => {
    const grant =
      record(context) && typeof context.token === 'string'
        ? capabilities.get(context.token)
        : undefined;
    if (!grant) throw new Error('invalid_review_context');
    return { grant, binding: current(grant.sessionId, grant.threadId) };
  };
  const proposalFor = (binding: Binding): Proposal => {
    if (!binding.proposalId) throw new Error('proposal_not_found');
    return store.proposal(binding.sessionId, binding.proposalId);
  };

  return {
    authorize(sessionId, body) {
      const generation = store.generation(sessionId);
      if (
        !record(body) ||
        !identifier(body.threadId) ||
        !identifier(body.runId) ||
        !record(body.state) ||
        !identifier(body.state.selectedPaymentId)
      ) {
        throw new Error('invalid_review_request');
      }
      const { threadId, state } = body;
      const selectedPaymentId = state.selectedPaymentId as string;
      const selectedInvoiceId = state.selectedInvoiceId;
      if (
        selectedInvoiceId !== undefined &&
        (!identifier(selectedInvoiceId) ||
          !store
            .snapshot(sessionId)
            .invoices.some((invoice) => invoice.id === selectedInvoiceId))
      )
        throw new Error('invoice_not_found');
      if (
        !store
          .snapshot(sessionId)
          .payments.some((payment) => payment.id === selectedPaymentId)
      ) {
        throw new Error('payment_not_found');
      }
      if (!record(body.hashbrown) || body.hashbrown.ui !== true)
        throw new Error('invalid_ui_mode');
      if (!isDeepStrictEqual(body.hashbrown.responseSchema, responseSchema))
        throw new Error('invalid_response_schema');
      if (
        body.tools !== undefined &&
        (!Array.isArray(body.tools) || body.tools.length !== 0)
      ) {
        throw new Error('client_tools_forbidden');
      }
      if (
        body.forwardedProps !== undefined &&
        (!record(body.forwardedProps) ||
          Object.keys(body.forwardedProps).length !== 0)
      ) {
        throw new Error('forwarded_props_forbidden');
      }
      let decision: ReviewContext['decision'] = 'initial';
      if (body.resume !== undefined) {
        if (!Array.isArray(body.resume) || body.resume.length > 1)
          throw new Error('invalid_resume');
        if (body.resume.length === 1) {
          const resume: unknown = body.resume[0];
          if (!record(resume) || !identifier(resume.interruptId))
            throw new Error('invalid_resume');
          if (
            resume.status === 'resolved' &&
            resume.payload === 'once' &&
            Object.keys(resume).length === 3
          )
            decision = 'once';
          else if (
            resume.status === 'cancelled' &&
            Object.keys(resume).length === 2
          )
            decision = 'cancelled';
          else throw new Error('invalid_resume');
        }
      }
      const existing = bindings.get(threadId);
      const binding = existing
        ? current(sessionId, threadId)
        : {
            sessionId,
            threadId,
            selectedPaymentId,
            selectedInvoiceId: selectedInvoiceId as string | undefined,
            generation,
          };
      if (
        binding.selectedPaymentId !== selectedPaymentId ||
        binding.selectedInvoiceId !== selectedInvoiceId
      )
        throw new Error('thread_binding_conflict');
      if (decision !== 'initial') {
        const proposal = proposalFor(binding);
        if (
          state.proposalId !== proposal.proposalId ||
          state.proposalVersion !== proposal.proposalVersion ||
          state.operationId !== proposal.operationId ||
          state.generation !== proposal.generation
        ) {
          throw new Error('proposal_identity_conflict');
        }
      }
      bindings.set(threadId, binding);
      const threadTokens = tokens.get(threadId) ?? {};
      const existingToken = threadTokens[decision];
      if (existingToken)
        return capabilities.get(existingToken) as ReviewContext;
      const token = randomUUID();
      const context: ReviewContext = Object.freeze({
        token,
        sessionId,
        threadId,
        selectedPaymentId,
        selectedInvoiceId: selectedInvoiceId as string | undefined,
        generation,
        responseSchema,
        decision,
      });
      tokens.set(threadId, { ...threadTokens, [decision]: token });
      capabilities.set(token, context);
      return context;
    },
    prepare(context, request) {
      const { grant, binding } = resolve(context);
      if (grant.decision !== 'initial')
        throw new Error('initial_request_required');
      if (!record(request) || request.paymentId !== binding.selectedPaymentId)
        throw new Error('payment_binding_conflict');
      if (
        binding.selectedInvoiceId &&
        request.invoiceId !== binding.selectedInvoiceId
      )
        throw new Error('invoice_binding_conflict');
      if (binding.proposalId) {
        const proposal = proposalFor(binding);
        if (
          request.invoiceId !== proposal.invoiceId ||
          request.amountCents !== proposal.amountCents
        )
          throw new Error('proposal_conflict');
        return proposal;
      }
      const proposal = store.propose(binding.sessionId, request);
      bindings.set(binding.threadId, {
        ...binding,
        proposalId: proposal.proposalId,
      });
      return proposal;
    },
    apply(context, proposalId) {
      const { grant, binding } = resolve(context);
      if (grant.decision !== 'once') throw new Error('approval_required');
      const proposal = proposalFor(binding);
      if (proposalId !== proposal.proposalId)
        throw new Error('proposal_identity_conflict');
      return store.decide(binding.sessionId, {
        proposalId: proposal.proposalId,
        proposalVersion: proposal.proposalVersion,
        operationId: proposal.operationId,
        generation: proposal.generation,
        decision: 'approve',
      });
    },
    getProposal(sessionId, threadId) {
      return proposalFor(current(sessionId, threadId));
    },
  };
}
