import { s } from '../schema';
import { prompt } from '../prompt/prompt';
import { createUiKit } from './ui-kit';

test('createUiKit composes components and UiKit instances', () => {
  const componentA = {
    component: {},
    name: 'Card',
    description: 'Card component',
  };
  const componentB = {
    component: {},
    name: 'Button',
    description: 'Button component',
  };
  const kitA = createUiKit({ components: [componentA] });

  const kitB = createUiKit({ components: [kitA, componentB] });

  expect(kitB.registry.size).toBe(2);
  expect(kitB.components).toHaveLength(2);
});

test('createUiKit throws on name collisions with different components', () => {
  const componentA = {
    component: {},
    name: 'Card',
    description: 'Card component',
  };
  const componentB = {
    component: {},
    name: 'Card',
    description: 'Another card component',
  };

  const create = () => createUiKit({ components: [componentA, componentB] });

  expect(create).toThrow(/Component name collision/);
});

test('createUiKit allows name reuse for the same component reference', () => {
  const shared = {};
  const componentA = {
    component: shared,
    name: 'Card',
    description: 'Card component',
  };
  const componentB = {
    component: shared,
    name: 'Card',
    description: 'Card component',
  };

  const kit = createUiKit({ components: [componentA, componentB] });

  expect(kit.registry.size).toBe(1);
  expect(kit.components).toHaveLength(1);
});

test('createUiKit produces stable serialized schemas for identical inputs', () => {
  const componentA = {
    component: {},
    name: 'Card',
    description: 'Card component',
  };
  const componentB = {
    component: {},
    name: 'Button',
    description: 'Button component',
  };

  const kitA = createUiKit({ components: [componentA, componentB] });
  const kitB = createUiKit({ components: [componentA, componentB] });

  expect(kitA.serializedSchema).toBe(kitB.serializedSchema);
});

test('createUiKit stores compiled examples on the wrapper schema description', () => {
  // Arrange
  const componentA = {
    component: {},
    name: 'Card',
    description: 'Card component',
  };
  const examples = prompt`<ui><Card /></ui>`;

  // Act
  const kit = createUiKit({ components: [componentA], examples });

  // Assert
  expect(kit.examples).toContain('Card');
  const jsonSchema = s.toJsonSchema(kit.schema);
  expect(jsonSchema.description ?? '').toMatchInlineSnapshot(`
"Return a JSON object with a single key "ui" that matches the schema below. Use only these components.



{
  "ui": [
    {
      "Card": {
        "props": {}
      }
    }
  ]
}

"
`);
});

test('createUiKit throws when example prompt diagnostics exist', () => {
  // Arrange
  const componentA = {
    component: {},
    name: 'Card',
    description: 'Card component',
  };
  const examples = prompt`<ui><Unknown /></ui>`;

  // Act
  const create = () => createUiKit({ components: [componentA], examples });

  // Assert
  expect(create).toThrow(/Example prompt has/);
});
