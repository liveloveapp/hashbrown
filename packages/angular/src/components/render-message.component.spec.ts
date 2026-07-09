import { InjectionToken, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RenderMessageComponent } from './render-message.component';
import { TAG_NAME_REGISTRY } from '../utils/ui-chat.helpers';
import { createUiKit } from '../utils/ui-kit.fn';

const TOKEN = new InjectionToken<string>('render-message-token');

test('renders using tag registry from assistant messages', () => {
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

  fixture.componentRef.setInput('message', message);

  const node = message.content.ui[0];

  expect(component.getRenderableComponent(node)).toBe(CardComponent);
});

test('renders with ui + uiKit inputs', () => {
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

  const ui = {
    ui: [
      {
        Tile: {
          props: {
            complete: true,
            partialValue: {},
            value: {},
          },
        },
      },
    ],
  };

  fixture.componentRef.setInput('ui', ui);
  fixture.componentRef.setInput('uiKit', uiKit);

  expect(component.tagNameRegistry()).toEqual(uiKit.tagNameRegistry);
  expect(component.getRenderableComponent(ui.ui[0])).toBe(TileComponent);
});

test('creates a child injector only when providers are defined', () => {
  const fixture = TestBed.configureTestingModule({
    imports: [RenderMessageComponent],
  }).createComponent(RenderMessageComponent);
  const component = fixture.componentInstance;

  class CardComponent {}

  const providers: Provider[] = [{ provide: TOKEN, useValue: 'configured' }];

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
          },
        },
      ],
    },
    toolCalls: [],
    [TAG_NAME_REGISTRY]: {
      Card: {
        props: {},
        component: CardComponent,
        providers,
      },
    },
  };

  fixture.componentRef.setInput('message', message);

  const withProviders = component.getRenderableInjector(message.content.ui[0]);

  expect(withProviders).toBeTruthy();
  expect(withProviders?.get(TOKEN)).toBe('configured');

  const withoutProviders = component.getRenderableInjector({
    Missing: {
      props: {
        complete: true,
        partialValue: {},
        value: {},
      },
    },
  });

  expect(withoutProviders).toBeUndefined();
});

test('throws when message and ui are provided together', () => {
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
  fixture.componentRef.setInput('ui', { ui: [] });
  fixture.componentRef.setInput('uiKit', uiKit);

  const getContent = () => component.content();

  expect(getContent).toThrow(
    'hb-render-message accepts either "message" or "ui", but not both.',
  );
});

test('throws when ui is provided without a uiKit', () => {
  const fixture = TestBed.configureTestingModule({
    imports: [RenderMessageComponent],
  }).createComponent(RenderMessageComponent);
  const component = fixture.componentInstance;

  fixture.componentRef.setInput('ui', { ui: [] });

  expect(() => component.content()).toThrow(
    'hb-render-message requires "uiKit" when rendering a UI wrapper.',
  );
});

test('throws when ui does not match the uiKit schema', () => {
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

  const ui = {
    ui: [
      {
        Unknown: {
          props: {
            complete: true,
            partialValue: {},
            value: {},
          },
        },
      },
    ],
  };

  fixture.componentRef.setInput('ui', ui);
  fixture.componentRef.setInput('uiKit', uiKit);

  expect(() => component.content()).toThrow();
});

test('returns empty content and tag registry defaults when no inputs are provided', () => {
  const fixture = TestBed.configureTestingModule({
    imports: [RenderMessageComponent],
  }).createComponent(RenderMessageComponent);
  const component = fixture.componentInstance;

  expect(component.content()).toEqual([]);
  expect(component.tagNameRegistry()).toEqual({});
});

test('returns empty content when message has no ui content', () => {
  const fixture = TestBed.configureTestingModule({
    imports: [RenderMessageComponent],
  }).createComponent(RenderMessageComponent);
  const component = fixture.componentInstance;

  fixture.componentRef.setInput('message', {
    role: 'assistant' as const,
    content: undefined,
    toolCalls: [],
  });

  expect(component.content()).toEqual([]);
});

test('node helpers handle invalid and empty node shapes', () => {
  const fixture = TestBed.configureTestingModule({
    imports: [RenderMessageComponent],
  }).createComponent(RenderMessageComponent);
  const component = fixture.componentInstance;
  const emptyNode = {};
  const propsNode = {
    Card: {
      props: {
        complete: false,
        partialValue: {},
      },
    },
  };

  expect(component.getNodeEntry(null as never)).toBeNull();
  expect(component.getNodeEntry(emptyNode as never)).toBeNull();
  expect(component.getNodeEntry(emptyNode as never)).toBeNull();
  expect(component.getNodeChildren(emptyNode as never)).toBeUndefined();
  expect(component.getChildrenArray(emptyNode as never)).toEqual([]);
  expect(component.getTextChildren(emptyNode as never)).toBe('');
  expect(component.getRenderableComponent(emptyNode as never)).toBeNull();
  expect(component.getRenderableComponent(propsNode as never)).toBeNull();
  expect(component.getRenderableInputs(propsNode as never)).toBeNull();
  expect(component.getRenderableInjector(emptyNode as never)).toBeUndefined();
  expect(component.isRenderableComplete(null as never)).toBe(false);
  expect(component.isTextNode(emptyNode as never)).toBe(false);
});

test('uses fallback component and partial props when value is not complete', () => {
  const fixture = TestBed.configureTestingModule({
    imports: [RenderMessageComponent],
  }).createComponent(RenderMessageComponent);
  const component = fixture.componentInstance;

  class FallbackCardComponent {}

  const message = {
    role: 'assistant' as const,
    content: {
      ui: [],
    },
    toolCalls: [],
    [TAG_NAME_REGISTRY]: {
      Card: {
        props: {},
        fallback: FallbackCardComponent,
      },
    },
  };
  const node = {
    Card: {
      props: {
        complete: false,
        partialValue: { title: 'partial' },
      },
    },
  };

  fixture.componentRef.setInput('message', message);

  const firstComponent = component.getRenderableComponent(node as never);
  const secondComponent = component.getRenderableComponent(node as never);
  const firstInputs = component.getRenderableInputs(node as never);
  const secondInputs = component.getRenderableInputs(node as never);

  expect(firstComponent).toBe(FallbackCardComponent);
  expect(secondComponent).toBe(FallbackCardComponent);
  expect(firstInputs).toEqual({ partialProps: { title: 'partial' } });
  expect(secondInputs).toEqual({ partialProps: { title: 'partial' } });
});

test('caches injector and returns undefined when providers are empty', () => {
  const fixture = TestBed.configureTestingModule({
    imports: [RenderMessageComponent],
  }).createComponent(RenderMessageComponent);
  const component = fixture.componentInstance;

  class CardComponent {}

  const message = {
    role: 'assistant' as const,
    content: { ui: [] },
    toolCalls: [],
    [TAG_NAME_REGISTRY]: {
      Card: {
        props: {},
        component: CardComponent,
        providers: [{ provide: TOKEN, useValue: 'cached' }],
      },
      Empty: {
        props: {},
        component: CardComponent,
        providers: [],
      },
    },
  };

  fixture.componentRef.setInput('message', message);

  const nodeWithProviders = {
    Card: {
      props: {
        complete: true,
        partialValue: {},
        value: {},
      },
    },
  };
  const nodeWithoutProviders = {
    Empty: {
      props: {
        complete: true,
        partialValue: {},
        value: {},
      },
    },
  };

  const firstInjector = component.getRenderableInjector(
    nodeWithProviders as never,
  );
  const secondInjector = component.getRenderableInjector(
    nodeWithProviders as never,
  );
  const noProviderInjector = component.getRenderableInjector(
    nodeWithoutProviders as never,
  );

  expect(firstInjector?.get(TOKEN)).toBe('cached');
  expect(secondInjector).toBe(firstInjector);
  expect(noProviderInjector).toBeUndefined();
});

test('reuses injector across immutable node identity changes for the same tag', () => {
  const fixture = TestBed.configureTestingModule({
    imports: [RenderMessageComponent],
  }).createComponent(RenderMessageComponent);
  const component = fixture.componentInstance;

  class CardComponent {}

  const message = {
    role: 'assistant' as const,
    content: { ui: [] },
    toolCalls: [],
    [TAG_NAME_REGISTRY]: {
      Card: {
        props: {},
        component: CardComponent,
        providers: [{ provide: TOKEN, useValue: 'stable' }],
      },
    },
  };

  fixture.componentRef.setInput('message', message);

  const firstNode = {
    Card: {
      props: {
        complete: true,
        partialValue: {},
        value: {},
      },
    },
  };
  const secondNode = {
    Card: {
      props: {
        complete: true,
        partialValue: {},
        value: {},
      },
    },
  };

  const firstInjector = component.getRenderableInjector(firstNode as never);
  const secondInjector = component.getRenderableInjector(secondNode as never);

  expect(firstInjector?.get(TOKEN)).toBe('stable');
  expect(secondInjector).toBe(firstInjector);
});

test('returns cached renderable content only when node has props value and children key', () => {
  const fixture = TestBed.configureTestingModule({
    imports: [RenderMessageComponent],
  }).createComponent(RenderMessageComponent);
  const component = fixture.componentInstance as RenderMessageComponent & {
    getRootNodes: (tpl: never) => unknown[][];
  };

  let getRootNodesCalls = 0;
  component.getRootNodes = () => {
    getRootNodesCalls += 1;
    return [['root-node']];
  };

  const tpl = {} as never;
  const node = {
    Card: {
      props: {
        complete: true,
        partialValue: {},
        value: { title: 'done' },
      },
      children: [],
    },
  };
  const missingChildrenKeyNode = {
    Card: {
      props: {
        complete: true,
        partialValue: {},
        value: { title: 'done' },
      },
    },
  };
  const missingValueNode = {
    Card: {
      props: {
        complete: false,
        partialValue: {},
      },
      children: [],
    },
  };

  const firstContent = component.getRenderableContent(node as never, tpl);
  const secondContent = component.getRenderableContent(node as never, tpl);

  expect(firstContent).toEqual([['root-node']]);
  expect(secondContent).toBe(firstContent);
  expect(getRootNodesCalls).toBe(1);
  expect(
    component.getRenderableContent(missingChildrenKeyNode as never, tpl),
  ).toBeUndefined();
  expect(
    component.getRenderableContent(missingValueNode as never, tpl),
  ).toBeUndefined();
  expect(component.getRenderableContent(null as never, tpl)).toBeUndefined();
});

test('computes recursive render completion for nested children and text nodes', () => {
  const fixture = TestBed.configureTestingModule({
    imports: [RenderMessageComponent],
  }).createComponent(RenderMessageComponent);
  const component = fixture.componentInstance;

  const completeNode = {
    Card: {
      props: {
        complete: true,
        partialValue: {},
        value: {},
      },
      children: [
        {
          Child: {
            props: {
              complete: true,
              partialValue: {},
              value: {},
            },
            children: 'done',
          },
        },
      ],
    },
  };
  const incompleteNode = {
    Card: {
      props: {
        complete: true,
        partialValue: {},
        value: {},
      },
      children: [
        {
          Child: {
            props: {
              complete: false,
              partialValue: {},
            },
            children: [],
          },
        },
      ],
    },
  };

  expect(component.isRenderableComplete(completeNode as never)).toBe(true);
  expect(component.isRenderableComplete(incompleteNode as never)).toBe(false);
  expect(
    component.isTextNode({
      Card: {
        props: { value: {} },
        children: 'text child',
      },
    } as never),
  ).toBe(true);
});
