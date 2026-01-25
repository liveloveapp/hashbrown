import { TestBed } from '@angular/core/testing';
import { RenderMessageComponent } from './render-message.component';
import { TAG_NAME_REGISTRY } from '../utils/ui-chat.helpers';
import { createUiKit } from '../utils/ui-kit.fn';

test('renders using tag registry from assistant messages', () => {
  // Arrange
  const fixture = TestBed.configureTestingModule({
    imports: [RenderMessageComponent],
  }).createComponent(RenderMessageComponent);
  const component = fixture.componentInstance;

  class CardComponent {}

  const message = {
    role: 'assistant' as const,
    content: {
      ui: [
        {
          Card: {
            props: {
              complete: true,
              partialValue: {},
              value: {},
            },
            children: [],
          },
        },
      ],
    },
    toolCalls: [],
    [TAG_NAME_REGISTRY]: {
      Card: {
        props: {},
        component: CardComponent,
      },
    },
  };

  // Act
  fixture.componentRef.setInput('message', message);

  const node = message.content.ui[0];

  // Assert
  expect(component.getRenderableComponent(node)).toBe(CardComponent);
});

test('renders with ui + uiKit inputs', () => {
  // Arrange
  const fixture = TestBed.configureTestingModule({
    imports: [RenderMessageComponent],
  }).createComponent(RenderMessageComponent);
  const component = fixture.componentInstance;

  class TileComponent {}

  const uiKit = createUiKit({
    components: [
      {
        component: TileComponent,
        name: 'Tile',
        description: 'Tile component',
      },
    ],
  });

  const ui = [
    {
      Tile: {
        props: {
          complete: true,
          partialValue: {},
          value: {},
        },
        children: [],
      },
    },
  ];

  // Act
  fixture.componentRef.setInput('ui', ui);
  fixture.componentRef.setInput('uiKit', uiKit);

  // Assert
  expect(component.tagNameRegistry()).toEqual(uiKit.tagNameRegistry);
  expect(component.getRenderableComponent(ui[0])).toBe(TileComponent);
});

test('throws when message and ui are provided together', () => {
  // Arrange
  const fixture = TestBed.configureTestingModule({
    imports: [RenderMessageComponent],
  }).createComponent(RenderMessageComponent);
  const component = fixture.componentInstance;

  const uiKit = createUiKit({
    components: [
      {
        component: class {},
        name: 'Card',
        description: 'Card component',
      },
    ],
  });

  fixture.componentRef.setInput('message', {
    role: 'assistant' as const,
    content: { ui: [] },
    toolCalls: [],
    [TAG_NAME_REGISTRY]: {},
  });
  fixture.componentRef.setInput('ui', []);
  fixture.componentRef.setInput('uiKit', uiKit);

  // Act
  const getContent = () => component.content();

  // Assert
  expect(getContent).toThrow(
    'hb-render-message accepts either "message" or "ui", but not both.',
  );
});

test('throws when ui is provided without a uiKit', () => {
  // Arrange
  const fixture = TestBed.configureTestingModule({
    imports: [RenderMessageComponent],
  }).createComponent(RenderMessageComponent);
  const component = fixture.componentInstance;

  // Act
  fixture.componentRef.setInput('ui', []);

  // Assert
  expect(() => component.content()).toThrow(
    'hb-render-message requires "uiKit" when rendering a UI array.',
  );
});

test('throws when ui does not match the uiKit schema', () => {
  // Arrange
  const fixture = TestBed.configureTestingModule({
    imports: [RenderMessageComponent],
  }).createComponent(RenderMessageComponent);
  const component = fixture.componentInstance;

  class CardComponent {}

  const uiKit = createUiKit({
    components: [
      {
        component: CardComponent,
        name: 'Card',
        description: 'Card component',
      },
    ],
  });

  const ui = [
    {
      Unknown: {
        props: {
          complete: true,
          partialValue: {},
          value: {},
        },
        children: [],
      },
    },
  ];

  // Act
  fixture.componentRef.setInput('ui', ui);
  fixture.componentRef.setInput('uiKit', uiKit);

  // Assert
  expect(() => component.content()).toThrow();
});
