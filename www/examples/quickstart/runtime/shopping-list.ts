import { s } from '@hashbrownai/core';

/** Streams shopping-list items once their required field values resolve. */
export const shoppingListSchema = s.object('A shopping list draft', {
  items: s.streaming.array(
    'The requested shopping items',
    s.object('A complete shopping item', {
      name: s.string('The product name'),
      quantity: s.integer('How many to add'),
    }),
  ),
});

/** A shopping list after parsing; application rules still require validation. */
export type ShoppingList = s.Infer<typeof shoppingListSchema>;

/** Runtime state needed to authorize applying one explicitly requested draft. */
export interface ShoppingListRun {
  readonly requestId: string | undefined;
  readonly cancelled: boolean;
  readonly messages: readonly {
    readonly id?: string;
    readonly role: string;
    readonly content?: unknown;
  }[];
  readonly isSending: boolean;
  readonly isReceiving: boolean;
  readonly isGenerating: boolean;
  readonly isLoading: boolean;
  readonly error?: unknown;
  readonly finishReason?: string;
}

/** Returns a trimmed, independent copy when all application rules pass. */
export function validateShoppingList(input: unknown): ShoppingList | undefined {
  if (
    typeof input !== 'object' ||
    input === null ||
    !('items' in input) ||
    !Array.isArray(input.items)
  )
    return undefined;
  if (input.items.length < 1 || input.items.length > 10) return undefined;
  const items: ShoppingList['items'] = [];
  for (const item of input.items) {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof item.name !== 'string' ||
      !Number.isInteger(item.quantity)
    )
      return undefined;
    const name = item.name.trim();
    if (
      name.length < 1 ||
      name.length > 80 ||
      item.quantity < 1 ||
      item.quantity > 20
    )
      return undefined;
    items.push({ name, quantity: item.quantity });
  }
  return { items };
}

/** Revalidates a fresh answer only after its runtime settles without failure. */
export function getApplicableShoppingList(
  run: ShoppingListRun,
): ShoppingList | undefined {
  // isSending covers the debounce window before aggregate isLoading becomes true.
  if (
    !run.requestId ||
    run.cancelled ||
    run.error ||
    run.isSending ||
    run.isReceiving ||
    run.isGenerating ||
    run.isLoading ||
    (run.finishReason !== undefined && run.finishReason !== 'stop')
  )
    return undefined;
  const reversedMessages = [...run.messages].reverse();
  const userIndex = reversedMessages.findIndex(
    (message) => message.role === 'user',
  );
  if (userIndex < 0 || reversedMessages[userIndex].id !== run.requestId)
    return undefined;
  const answer = reversedMessages
    .slice(0, userIndex)
    .find((message) => message.role === 'assistant');
  return validateShoppingList(answer?.content);
}
