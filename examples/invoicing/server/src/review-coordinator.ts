import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type {
  DecisionResult,
  Proposal,
  ProposalRequest,
} from '@invoicing/contracts';
import type { SessionStore } from './session-store';
import {
  ConflictError,
  type Document,
  type ThreadRecord,
  type ThreadRepository,
} from './persistence/types';

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
  authorize(sessionId: string, body: unknown): Promise<ReviewContext>;
  /** Prepare one immutable allocation during an initial run. */
  prepare(context: ReviewContext, request: ProposalRequest): Promise<Proposal>;
  /** Apply a stored proposal after B4 separately validates the pending interrupt. */
  apply(context: ReviewContext, proposalId: string): Promise<DecisionResult>;
  /** Read a proposal only from its owning session and thread. */
  getProposal(sessionId: string, threadId: string): Promise<Proposal>;
}

const decisions = ['initial', 'once', 'cancelled'] as const;

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
 * Create a guard over persisted thread records using opaque server-only capabilities.
 *
 * A once payload is only a requested decision. The B4 runtime must validate its
 * actual pending interrupt before calling apply; this guard cannot prove that.
 * Run IDs are validated as transport identifiers; authority is scoped to the
 * thread and its one immutable proposal, so a new run does not create a grant.
 * Capabilities are reused with at most three per thread. Stored records remain
 * tombstones so reset cannot let an old thread claim a new session.
 */
export function createReviewCoordinator(
  store: SessionStore,
  threads: ThreadRepository,
  expectedResponseSchema: unknown,
): ReviewCoordinator {
  const responseSchema = freeze(structuredClone(expectedResponseSchema));

  const check = (
    sessionId: string,
    generation: number,
    stored: ThreadRecord,
  ): ThreadRecord => {
    if (stored.sessionId !== sessionId || stored.routeId !== '/review')
      throw new Error('thread_binding_conflict');
    if (stored.generation !== generation) throw new Error('stale_generation');
    return stored;
  };
  const current = async (
    sessionId: string,
    threadId: string,
  ): Promise<Document<ThreadRecord>> => {
    const generation = await store.generation(sessionId);
    const document = await threads.load(threadId);
    if (!document) throw new Error('thread_not_found');
    check(sessionId, generation, document.value);
    return document;
  };
  const load = async (threadId: string): Promise<Document<ThreadRecord>> => {
    const document = await threads.load(threadId);
    if (!document) throw new Error('thread_not_found');
    return document;
  };
  const proposalFor = (stored: ThreadRecord): Promise<Proposal> => {
    if (!stored.proposalId) throw new Error('proposal_not_found');
    return store.proposal(stored.sessionId, stored.proposalId);
  };
  const context = (
    threadId: string,
    stored: ThreadRecord,
    token: string,
    decision: ReviewContext['decision'],
  ): ReviewContext =>
    Object.freeze({
      token,
      sessionId: stored.sessionId,
      threadId,
      selectedPaymentId: stored.selectedPaymentId as string,
      selectedInvoiceId: stored.selectedInvoiceId,
      generation: stored.generation,
      responseSchema,
      decision,
    });

  /**
   * Resolve the stored capability a caller presents. The decision is read from
   * the record that holds the token, so mutating the public context grants no
   * additional authority.
   */
  const resolve = async (
    caller: ReviewContext,
  ): Promise<{
    grant: ReviewContext;
    binding: ThreadRecord;
    threadId: string;
    version: number;
  }> => {
    if (!record(caller) || typeof caller.token !== 'string')
      throw new Error('invalid_review_context');
    const document = await threads.load(caller.threadId);
    const granted = document
      ? decisions.find((value) => document.value.tokens[value] === caller.token)
      : undefined;
    if (!document || !granted) throw new Error('invalid_review_context');
    const binding = document.value;
    check(
      binding.sessionId,
      await store.generation(binding.sessionId),
      binding,
    );
    return {
      grant: context(caller.threadId, binding, caller.token, granted),
      binding,
      threadId: caller.threadId,
      version: document.version,
    };
  };

  return {
    async authorize(sessionId, body) {
      const generation = await store.generation(sessionId);
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
          !(await store.snapshot(sessionId)).invoices.some(
            (invoice) => invoice.id === selectedInvoiceId,
          ))
      )
        throw new Error('invoice_not_found');
      if (
        !(await store.snapshot(sessionId)).payments.some(
          (payment) => payment.id === selectedPaymentId,
        )
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
      const created: ThreadRecord = {
        sessionId,
        routeId: '/review',
        generation,
        selectedPaymentId,
        selectedInvoiceId: selectedInvoiceId as string | undefined,
        tokens: {},
      };
      let document = await threads.load(threadId);
      if (!document && decision !== 'initial') {
        // A resume never creates a thread; it can only approve a prepared one.
        await proposalFor(created);
      }
      if (!document) {
        try {
          await threads.commit(threadId, null, created);
          document = await load(threadId);
        } catch (error) {
          if (!(error instanceof ConflictError)) throw error;
          document = await load(threadId);
        }
      }
      const binding = check(sessionId, generation, document.value);
      if (
        binding.selectedPaymentId !== selectedPaymentId ||
        binding.selectedInvoiceId !== selectedInvoiceId
      )
        throw new Error('thread_binding_conflict');
      if (decision !== 'initial') {
        const proposal = await proposalFor(binding);
        if (
          state.proposalId !== proposal.proposalId ||
          state.proposalVersion !== proposal.proposalVersion ||
          state.operationId !== proposal.operationId ||
          state.generation !== proposal.generation
        ) {
          throw new Error('proposal_identity_conflict');
        }
      }
      const existingToken = binding.tokens[decision];
      if (existingToken)
        return context(threadId, binding, existingToken, decision);
      const token = randomUUID();
      const mint = (stored: ThreadRecord): ThreadRecord => ({
        ...stored,
        tokens: { ...stored.tokens, [decision]: token },
      });
      try {
        await threads.commit(threadId, document.version, mint(binding));
        return context(threadId, binding, token, decision);
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error;
      }
      const reloaded = await load(threadId);
      const concurrent = reloaded.value.tokens[decision];
      if (concurrent)
        return context(threadId, reloaded.value, concurrent, decision);
      try {
        await threads.commit(threadId, reloaded.version, mint(reloaded.value));
        return context(threadId, reloaded.value, token, decision);
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error;
      }
      const final = await load(threadId);
      const converged = final.value.tokens[decision];
      if (converged) return context(threadId, final.value, converged, decision);
      throw new Error('review_contention');
    },
    async prepare(caller, request) {
      const { grant, binding, threadId, version } = await resolve(caller);
      if (grant.decision !== 'initial')
        throw new Error('initial_request_required');
      if (!record(request) || request.paymentId !== binding.selectedPaymentId)
        throw new Error('payment_binding_conflict');
      if (
        binding.selectedInvoiceId &&
        request.invoiceId !== binding.selectedInvoiceId
      )
        throw new Error('invoice_binding_conflict');
      const matching = async (proposal: Proposal): Promise<Proposal> => {
        if (
          request.invoiceId !== proposal.invoiceId ||
          request.amountCents !== proposal.amountCents
        )
          throw new Error('proposal_conflict');
        return proposal;
      };
      if (binding.proposalId) return matching(await proposalFor(binding));
      // If the thread CAS below loses the race (e.g. a concurrent prepare
      // already wrote proposalId), this proposal is never referenced by any
      // thread record. It is inert: `apply` only ever reaches a proposal via
      // `stored.proposalId`, so an orphaned one can never be applied. It
      // remains visible read-only through `/api/proposals/:id` to the same
      // session, since proposals live in the session document independent of
      // thread ownership.
      const proposal = await store.propose(binding.sessionId, request);
      try {
        await threads.commit(threadId, version, {
          ...binding,
          proposalId: proposal.proposalId,
        });
        return proposal;
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error;
        const reloaded = await load(threadId);
        if (!reloaded.value.proposalId) throw error;
        return matching(await proposalFor(reloaded.value));
      }
    },
    async apply(caller, proposalId) {
      const { grant, binding } = await resolve(caller);
      if (grant.decision !== 'once') throw new Error('approval_required');
      const proposal = await proposalFor(binding);
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
    async getProposal(sessionId, threadId) {
      return proposalFor((await current(sessionId, threadId)).value);
    },
  };
}
