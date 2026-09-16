import { s, ɵcreateUiKit } from '@hashbrownai/core';

/** Shared model-facing configuration for the trusted proposal review component. */
export const allocationProposalConfig = {
  name: 'AllocationProposal',
  description:
    'Show a server-prepared allocation proposal for explicit user review.',
  children: false,
  props: {
    proposalId: s.string(
      'The identity of the server-prepared allocation proposal',
    ),
  },
} as const;

/** Canonical JSON response schema accepted by the invoicing server and React UI. */
export const invoicingUiResponseSchema: Record<string, unknown> =
  s.toJsonSchema(
    ɵcreateUiKit({
      components: [{ ...allocationProposalConfig, component: {} }],
    }).schema,
  );
