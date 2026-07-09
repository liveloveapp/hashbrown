import { InjectionToken, Provider } from '@angular/core';
import { createUiKit } from './ui-kit.fn';

const TOKEN = new InjectionToken<string>('ui-kit-token');

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

  expect(kit.tagNameRegistry['Card'].component).toBe(CardComponent);
});

test('createUiKit keeps providers in the tagNameRegistry', () => {
  class CardComponent {}

  const providers: Provider[] = [{ provide: TOKEN, useValue: 'configured' }];

  const kit = createUiKit({
    components: [
      {
        component: CardComponent,
        name: 'Card',
        description: 'Card component',
        providers,
      },
    ],
  });

  expect(kit.tagNameRegistry['Card'].providers).toBe(providers);
});
