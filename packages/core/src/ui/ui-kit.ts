/* eslint-disable @typescript-eslint/no-explicit-any */
import { s } from '../schema';
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
   * The resolved component tree schema.
   */
  readonly schema: ComponentTreeSchema;
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
  const { components } = options;
  const registry = new Map<string, T>();
  const normalized: T[] = [];

  components.forEach((component) => {
    if (isUiKit(component)) {
      component.components.forEach((entry) => addComponent(entry));
      return;
    }

    addComponent(component as T);
  });

  const schema = createComponentSchema(normalized);
  const serializedSchema = stableSerializeSchema(schema);

  return {
    [UI_KIT_SYMBOL]: true,
    components: normalized,
    registry,
    schema,
    serializedSchema,
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

function stableSerializeSchema(schema: ComponentTreeSchema): string {
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
