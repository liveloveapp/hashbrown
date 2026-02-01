/* eslint-disable @typescript-eslint/no-explicit-any */
import { s } from '../schema';
import type { SystemPrompt } from '../prompt/types';
import {
  ComponentTreeSchema,
  createComponentSchema,
  ExposedComponentDescriptor,
} from './expose-component';

const UI_KIT_SYMBOL = Symbol('hashbrown.uiKit');

/**
 * @public
 */
export type UiKitInput<T extends ExposedComponentDescriptor> = T | UiKit<T>;

/**
 * @public
 */
export interface UiKitOptions<T extends ExposedComponentDescriptor> {
  /**
   * Components or other UiKit instances to compose.
   */
  components: readonly UiKitInput<T>[];
  /**
   * Optional prompt-based UI examples to include in the wrapper schema description.
   */
  examples?: SystemPrompt;
}

/**
 * @public
 */
export interface UiKit<T extends ExposedComponentDescriptor> {
  /**
   * @internal
   */
  readonly [UI_KIT_SYMBOL]: true;
  /**
   * The normalized list of exposed components.
   */
  readonly components: readonly T[];
  /**
   * A registry of component definitions keyed by name.
   */
  readonly registry: ReadonlyMap<string, T>;
  /**
   * The resolved wrapper schema for UI output.
   */
  readonly schema: s.ObjectType<{
    ui: s.ArrayType<ComponentTreeSchema>;
  }>;
  /**
   * Compiled UI examples used by the schema description.
   */
  readonly examples: string | null;
  /**
   * Stable serialized form of the resolved schema.
   */
  readonly serializedSchema: string;
}

/**
 * @public
 */
export function isUiKit(value: unknown): value is UiKit<any> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as UiKit<any>)[UI_KIT_SYMBOL] === true,
  );
}

/**
 * Creates a UIKit instance from exposed components and/or other UiKits.
 *
 * @public
 */
export function createUiKit<T extends ExposedComponentDescriptor>(
  options: UiKitOptions<T>,
): UiKit<T> {
  const { components, examples } = options;
  const registry = new Map<string, T>();
  const normalized: T[] = [];

  components.forEach((component) => {
    if (isUiKit(component)) {
      component.components.forEach((entry) => addComponent(entry));
      return;
    }

    addComponent(component as T);
  });

  const nodeSchema = createComponentSchema(normalized);
  const baseSchema = s.object('UI', {
    ui: s.streaming.array('List of elements', nodeSchema),
  });
  const compiledExamples = examples
    ? compileExamples(examples, normalized, baseSchema)
    : null;
  const description = compiledExamples
    ? `Return a JSON object with a single key "ui" that matches the schema below. Use only these components.\n\n${compiledExamples}`
    : 'Return a JSON object with a single key "ui" that matches the schema below. Use only these components.';
  const schema =
    description === 'UI'
      ? baseSchema
      : s.object(description, {
          ui: s.streaming.array('List of elements', nodeSchema),
        });
  const serializedSchema = stableSerializeSchema(schema);

  return {
    [UI_KIT_SYMBOL]: true,
    components: normalized,
    registry,
    schema,
    serializedSchema,
    examples: compiledExamples,
  };

  function addComponent(component: T) {
    assertExposedComponent(component);

    const existing = registry.get(component.name);
    if (existing && existing.component !== component.component) {
      throw new Error(
        `Component name collision for "${component.name}". ` +
          `Each component name must map to a single component implementation.`,
      );
    }

    if (!existing) {
      registry.set(component.name, component);
      normalized.push(component);
    }

    if (component.children && Array.isArray(component.children)) {
      (component.children as T[]).forEach((child) => addComponent(child));
    }
  }
}

function assertExposedComponent(
  component: unknown,
): asserts component is ExposedComponentDescriptor {
  if (!component || typeof component !== 'object') {
    throw new Error(
      'Invalid component entry. Expected an exposeComponent(...) result or UiKit instance.',
    );
  }

  const value = component as ExposedComponentDescriptor;

  if (!('component' in value)) {
    throw new Error('Invalid component entry. Missing "component" reference.');
  }

  if (typeof value.name !== 'string' || value.name.length === 0) {
    throw new Error('Invalid component entry. Missing "name".');
  }

  if (typeof value.description !== 'string' || value.description.length === 0) {
    throw new Error('Invalid component entry. Missing "description".');
  }
}

function compileExamples(
  examples: SystemPrompt,
  components: readonly ExposedComponentDescriptor[],
  schema: s.HashbrownType,
): string {
  const compiled = examples.compile(components, schema);
  if (examples.diagnostics.length > 0) {
    throw new Error(
      `Example prompt has ${examples.diagnostics.length} errors: \n\n${examples.diagnostics.map((d) => d.message).join('\n\n')}`,
    );
  }
  return compiled;
}

function stableSerializeSchema(schema: s.HashbrownType): string {
  const jsonSchema = s.toJsonSchema(schema);
  return JSON.stringify(stableCopy(jsonSchema));
}

function stableCopy(value: any): any {
  if (Array.isArray(value)) {
    return value.map((entry) => stableCopy(entry));
  }

  if (value && typeof value === 'object') {
    const output: Record<string, any> = {};
    const keys = Object.keys(value).sort();
    keys.forEach((key) => {
      output[key] = stableCopy(value[key]);
    });
    return output;
  }

  return value;
}

export { UI_KIT_SYMBOL as ɵUI_KIT_SYMBOL };
