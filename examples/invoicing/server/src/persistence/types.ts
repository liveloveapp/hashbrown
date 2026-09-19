import type {
  DecisionRequest,
  DecisionResult,
  LedgerOverlay,
  Proposal,
} from '@invoicing/contracts';

/**
 * One session's authoritative state; plain records so it serialises to JSONB.
 * It is an overlay on the process-wide base ledger: only what this visitor
 * changed is stored. Rows written before this shape carry a `ledger` key and
 * no `allocations`; the session store normalizes them on load.
 */
export interface Session extends LedgerOverlay {
  readonly generation: number;
  readonly proposals: Readonly<Record<string, Proposal>>;
  readonly operations: Readonly<
    Record<
      string,
      { readonly request: DecisionRequest; readonly result: DecisionResult }
    >
  >;
}

/** Per-thread review binding, capability tokens, and ownership. */
export interface ThreadRecord {
  readonly sessionId: string;
  readonly routeId: string;
  readonly generation: number;
  readonly selectedPaymentId?: string;
  readonly selectedInvoiceId?: string;
  readonly proposalId?: string;
  readonly tokens: Readonly<
    Partial<Record<'initial' | 'once' | 'cancelled', string>>
  >;
}

export interface Document<T> {
  readonly version: number;
  readonly value: T;
}

export class ConflictError extends Error {
  constructor() {
    super('conflict');
    this.name = 'ConflictError';
  }
}

export interface SessionRepository {
  create(initial: Session): Promise<string>;
  load(id: string): Promise<Document<Session> | undefined>;
  /** Compare-and-swap. Rejects with ConflictError when `expectedVersion` is stale. */
  commit(id: string, expectedVersion: number, next: Session): Promise<void>;
}

export interface ThreadRepository {
  load(threadId: string): Promise<Document<ThreadRecord> | undefined>;
  /** `expectedVersion: null` inserts; rejects with ConflictError if the row exists or moved. */
  commit(
    threadId: string,
    expectedVersion: number | null,
    next: ThreadRecord,
  ): Promise<void>;
}

export interface Repositories {
  readonly sessions: SessionRepository;
  readonly threads: ThreadRepository;
  close(): Promise<void>;
}
