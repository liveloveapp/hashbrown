import { createUiKit } from './ui-kit.fn';

test('createUiKit builds a tagNameRegistry', () => {
  class CardComponent {}

  const kit = createUiKit({
    components: [
      {
        component: CardComponent,
        name: 'Card',
        description: 'Card component',
      },
    ],
  });

  expect(kit.tagNameRegistry.Card.component).toBe(CardComponent);
});
