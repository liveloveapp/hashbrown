import { renderHook } from '@testing-library/react';
import { s } from '@hashbrownai/core';
import { exposeComponent, useUiKit } from '@hashbrownai/react';
import {
  allocationProposalConfig,
  invoicingUiResponseSchema,
} from '@invoicing/contracts';
import { expect, test } from 'vitest';
import { AllocationProposal } from './allocation-proposal';

test('the React proposal kit serializes to the exact server response schema', () => {
  const components = [
    exposeComponent(AllocationProposal, allocationProposalConfig),
  ];

  const { result } = renderHook(() => useUiKit({ components }));

  expect(s.toJsonSchema(result.current.schema)).toEqual(
    invoicingUiResponseSchema,
  );
  expect(JSON.parse(result.current.serializedSchema)).toEqual(
    invoicingUiResponseSchema,
  );
  expect(result.current.components.map(({ name }) => name)).toEqual([
    'AllocationProposal',
  ]);
  expect(Object.keys(result.current.components[0].props ?? {})).toEqual([
    'proposalId',
  ]);
});
