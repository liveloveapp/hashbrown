import { createContext } from 'react';
import type { LedgerSnapshot } from '@invoicing/contracts';

/** The application's current ledger view; kit components resolve IDs against it, never trusting model-typed numbers. */
export const SnapshotContext = createContext<LedgerSnapshot | undefined>(
  undefined,
);
