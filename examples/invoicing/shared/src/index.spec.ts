import { expectTypeOf, test } from 'vitest';
import type { DecisionRequest, LedgerSnapshot } from './index';

test('approval contracts carry identity without browser-supplied money', () => {
  type DecisionFields = keyof DecisionRequest;

  expectTypeOf<DecisionFields>().toEqualTypeOf<
    'proposalId' | 'operationId' | 'generation' | 'proposalVersion' | 'decision'
  >();
  expectTypeOf<LedgerSnapshot['payments']>().toMatchTypeOf<
    readonly unknown[]
  >();
});
