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

/** Session-scoped API; callers never receive references to stored objects. */
export interface SessionStore {
  /** Allocate a new opaque session identity. */
  createSession(): string;
  /** Read the current server-owned reset generation. */
  generation(sessionId: string): number;
  /** Read the current financial snapshot. */
  snapshot(sessionId: string): LedgerSnapshot;
  /** Prepare and store the authoritative allocation proposal. */
  propose(sessionId: string, request: ProposalRequest): Proposal;
  /** Read a proposal belonging to this session. */
  proposal(sessionId: string, proposalId: string): Proposal;
  /** Apply a user decision exactly once in a synchronous critical section. */
  decide(sessionId: string, request: DecisionRequest): DecisionResult;
  /** Read a recorded operation result within its owning session. */
  operationResult(
    sessionId: string,
    operationId: string,
  ): DecisionResult | undefined;
  /** Restore the fixture and invalidate earlier proposal generations. */
  reset(sessionId: string): LedgerSnapshot;
}

interface Session {
  readonly generation: number;
  readonly ledger: Ledger;
  readonly proposals: ReadonlyMap<string, Proposal>;
  readonly operations: ReadonlyMap<
    string,
    { readonly request: DecisionRequest; readonly result: DecisionResult }
  >;
}

/** Create an in-memory store whose validation and replacement never await. */
export function createSessionStore(
  createInitialLedger: () => Ledger = createLedger,
): SessionStore {
  const sessions = new Map<string, Session>();
  const get = (id: string): Session => {
    const session = sessions.get(id);
    if (!session) throw new Error('session_not_found');
    return session;
  };
  return {
    createSession() {
      const id = randomUUID();
      sessions.set(id, {
        generation: 1,
        ledger: structuredClone(createInitialLedger()),
        proposals: new Map(),
        operations: new Map(),
      });
      return id;
    },
    generation(id) {
      return get(id).generation;
    },
    snapshot(id) {
      return structuredClone(getSnapshot(get(id).ledger));
    },
    propose(id, request) {
      const session = get(id);
      const proposal = createProposal(session.ledger, request, {
        generation: session.generation,
        proposalId: randomUUID(),
        operationId: randomUUID(),
      });
      sessions.set(id, {
        ...session,
        proposals: new Map([
          ...session.proposals,
          [proposal.proposalId, proposal],
        ]),
      });
      return structuredClone(proposal);
    },
    proposal(id, proposalId) {
      const proposal = get(id).proposals.get(proposalId);
      if (!proposal) throw new Error('proposal_not_found');
      return structuredClone(proposal);
    },
    decide(id, request) {
      const session = get(id);
      if (request.generation !== session.generation)
        throw new Error('stale_generation');
      if (request.decision !== 'approve' && request.decision !== 'decline')
        throw new Error('invalid_decision');
      const recorded = session.operations.get(request.operationId);
      if (recorded) {
        if (
          recorded.request.proposalId !== request.proposalId ||
          recorded.request.proposalVersion !== request.proposalVersion ||
          recorded.request.decision !== request.decision
        )
          throw new Error('operation_conflict');
        return structuredClone(recorded.result);
      }
      const proposal = session.proposals.get(request.proposalId);
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
      sessions.set(id, {
        ...session,
        ledger,
        operations: new Map([
          ...session.operations,
          [request.operationId, { request: identity, result }],
        ]),
      });
      return structuredClone(result);
    },
    operationResult(id, operationId) {
      return structuredClone(get(id).operations.get(operationId)?.result);
    },
    reset(id) {
      const session = get(id);
      const next: Session = {
        generation: session.generation + 1,
        ledger: structuredClone(createInitialLedger()),
        proposals: new Map(),
        operations: new Map(),
      };
      sessions.set(id, next);
      return structuredClone(getSnapshot(next.ledger));
    },
  };
}
