import {
  createGrowthActionToken,
  type GrowthTokenKeyring,
} from '@hashbrownai-internal/growth';

export const TEST_TOKEN_KEYRING: GrowthTokenKeyring = {
  active: { version: 1, secret: 'x'.repeat(48) },
};

export const TEST_NOW = new Date('2026-10-21T12:00:00.000Z');

export function mintToken(
  purpose: 'unsubscribe' | 'founder_stop',
  issuedAt: Date = TEST_NOW,
): string {
  return createGrowthActionToken(
    {
      contactId: '11111111-1111-4111-8111-111111111111',
      purpose,
      issuedAt,
      eventNonce: 'nonce-1',
    },
    TEST_TOKEN_KEYRING.active,
  );
}
