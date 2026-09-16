import { expect, test } from 'vitest';
import { allocationProposalConfig, invoicingUiResponseSchema } from './index';

test('exposes only the proposal identity through the shared UI descriptor', () => {
  const config = allocationProposalConfig;

  expect(config).toBeDefined();
  expect(config.name).toBe('AllocationProposal');
  expect(config.children).toBe(false);
  expect(Object.keys(config.props)).toEqual(['proposalId']);
  expect(() => config.props.proposalId.validate('proposal-1')).not.toThrow();
  expect(() => config.props.proposalId.validate(123)).toThrow();
});

test('provides the server with a bounded JSON response schema', () => {
  const schema = invoicingUiResponseSchema;

  expect(schema).toBeDefined();
  const serialized = JSON.stringify(schema);
  expect(serialized).toContain('AllocationProposal');
  expect(serialized).toContain('proposalId');
  for (const property of [
    'amountCents',
    'invoiceId',
    'paymentId',
    'currency',
    'decision',
  ]) {
    expect(serialized).not.toContain(`"${property}"`);
  }
});
