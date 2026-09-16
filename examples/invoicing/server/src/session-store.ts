import { randomUUID } from 'node:crypto';
import type {
  DecisionRequest,
  DecisionResult,
  Ledger,
  LedgerSnapshot,
  Proposal,
  ProposalRequest,
} from '@invoicing/contracts';
import {
  applyProposal,
  createLedger,
  createProposal,
  getSnapshot,
} from './ledger';
import {
  ConflictError,
  type Session,
  type SessionRepository,
} from './persistence/types';

/** Session-scoped API; callers never receive references to stored objects. */
export interface SessionStore {
  /** Allocate a new opaque session identity. */
  createSession(): Promise<string>;
  /** Read the current server-owned reset generation. */
  generation(sessionId: string): Promise<number>;
  /** Read the current financial snapshot. */
  snapshot(sessionId: string): Promise<LedgerSnapshot>;
  /** Prepare and store the authoritative allocation proposal. */
  propose(sessionId: string, request: ProposalRequest): Promise<Proposal>;
  /** Read a proposal belonging to this session. */
  proposal(sessionId: string, proposalId: string): Promise<Proposal>;
  /** Apply a user decision exactly once, retrying once on a concurrent write. */
  decide(sessionId: string, request: DecisionRequest): Promise<DecisionResult>;
  /** Read a recorded operation result within its owning session. */
  operationResult(
    sessionId: string,
    operationId: string,
  ): Promise<DecisionResult | undefined>;
  /** Restore the fixture and invalidate earlier proposal generations. */
  reset(sessionId: string): Promise<LedgerSnapshot>;
}

type Transition<R> = (session: Session) => {
  readonly session: Session;
  readonly result: R;
};

/** Every mutation is one compare-and-swap of the session document. */
export function createSessionStore(
  repository: SessionRepository,
  createInitialLedger: () => Ledger = createLedger,
): SessionStore {
  const load = async (id: string) => {
    const doc = await repository.load(id);
    if (!doc) throw new Error('session_not_found');
    return doc;
  };
  const mutate = async <R>(
    id: string,
    transition: Transition<R>,
  ): Promise<R> => {
    for (let attempt = 0; ; attempt += 1) {
      const doc = await load(id);
      const { session, result } = transition(doc.value);
      try {
        await repository.commit(id, doc.version, session);
        return result;
      } catch (error) {
        if (!(error instanceof ConflictError) || attempt === 1) throw error;
      }
    }
  };

  return {
    createSession() {
      return repository.create({
        generation: 1,
        ledger: structuredClone(createInitialLedger()),
        proposals: {},
        operations: {},
      });
    },
    async generation(id) {
      return (await load(id)).value.generation;
    },
    async snapshot(id) {
      return getSnapshot((await load(id)).value.ledger);
    },
    propose: (id, request) =>
      mutate(id, (session) => {
        const proposal = createProposal(session.ledger, request, {
          generation: session.generation,
          proposalId: randomUUID(),
          operationId: randomUUID(),
        });
        return {
          session: {
            ...session,
            proposals: {
              ...session.proposals,
              [proposal.proposalId]: proposal,
            },
          },
          result: proposal,
        };
      }),
    async proposal(id, proposalId) {
      const proposal = (await load(id)).value.proposals[proposalId];
      if (!proposal) throw new Error('proposal_not_found');
      return proposal;
    },
    decide: (id, request) =>
      mutate(id, (session) => {
        if (request.generation !== session.generation)
          throw new Error('stale_generation');
        if (request.decision !== 'approve' && request.decision !== 'decline')
          throw new Error('invalid_decision');
        const recorded = session.operations[request.operationId];
        if (recorded) {
          if (
            recorded.request.proposalId !== request.proposalId ||
            recorded.request.proposalVersion !== request.proposalVersion ||
            recorded.request.decision !== request.decision
          )
            throw new Error('operation_conflict');
          return { session, result: recorded.result };
        }
        const proposal = session.proposals[request.proposalId];
        if (!proposal) throw new Error('proposal_not_found');
        if (proposal.operationId !== request.operationId)
          throw new Error('operation_conflict');
        if (proposal.proposalVersion !== request.proposalVersion)
          throw new Error('stale_proposal');
        const ledger =
          request.decision === 'approve'
            ? applyProposal(session.ledger, proposal)
            : session.ledger;
        const result: DecisionResult = {
          proposalId: proposal.proposalId,
          operationId: proposal.operationId,
          status: request.decision === 'approve' ? 'approved' : 'declined',
          snapshot: getSnapshot(ledger),
        };
        const identity: DecisionRequest = {
          proposalId: request.proposalId,
          operationId: request.operationId,
          generation: request.generation,
          proposalVersion: request.proposalVersion,
          decision: request.decision,
        };
        return {
          session: {
            ...session,
            ledger,
            operations: {
              ...session.operations,
              [request.operationId]: { request: identity, result },
            },
          },
          result,
        };
      }),
    async operationResult(id, operationId) {
      return (await load(id)).value.operations[operationId]?.result;
    },
    reset: (id) =>
      mutate(id, (session) => {
        const next: Session = {
          generation: session.generation + 1,
          ledger: structuredClone(createInitialLedger()),
          proposals: {},
          operations: {},
        };
        return { session: next, result: getSnapshot(next.ledger) };
      }),
  };
}
