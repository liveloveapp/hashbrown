import type { SystemPrompt } from '../prompt/types';
import { s } from '../schema';
import type { ExposedComponentDescriptor } from './expose-component';
import { createUiKit } from './ui-kit';

/**
 * A component's contract with the model, without its implementation.
 *
 * Pass the same object to `exposeComponent` in the browser and to
 * {@link createUiJsonSchema} on the server, and both sides agree on the shape
 * of the UI the model streams.
 *
 * @public
 */
export interface UiComponentDefinition {
  /**
   * The tag name the model uses for this component.
   */
  name: string;
  /**
   * What the component shows and when the model should use it.
   */
  description: string;
  /**
   * What the component accepts as children: any component in the kit, text,
   * nothing, or a fixed list of child component definitions.
   */
  children?: 'any' | 'text' | false | readonly UiComponentDefinition[];
  /**
   * Skillet or Standard JSON Schema schemas for each prop.
   */
  props?: Record<string, s.HashbrownType | s.StandardJSONSchemaV1>;
}

/**
 * Options for {@link createUiJsonSchema}.
 *
 * @public
 */
export interface UiJsonSchemaOptions {
  /**
   * The components the model may render. Definitions may also be
   * `exposeComponent` results.
   */
  components: readonly UiComponentDefinition[];
  /**
   * Optional prompt-based UI examples, compiled into the schema description
   * exactly as `useUiKit`, `useUiChat` and `uiChatResource` compile them.
   */
  examples?: SystemPrompt;
}

/**
 * Creates the JSON Schema that a UI kit asks the model to follow, without
 * the component implementations.
 *
 * Use it when an agent that Hashbrown does not run produces the UI: pass the
 * result to the model as a structured output (response format) schema, or
 * include it in the agent's instructions. The browser then parses the
 * streamed message with `useJsonParser(content, kit.schema)` and renders it
 * with `kit.render(value)`.
 *
 * The result is plain JSON, identical to the response schema `useUiChat`
 * sends for a kit built from the same definitions, so it can be written to a
 * file for agents in other languages.
 *
 * @public
 * @param options - The component definitions and optional examples.
 * @returns The JSON Schema for a `{ "ui": [...] }` response.
 */
export function createUiJsonSchema(
  options: UiJsonSchemaOptions,
): Record<string, unknown> {
  const descriptors = new Map<object, ExposedComponentDescriptor>();
  const kit = createUiKit({
    components: options.components.map(toDescriptor),
    examples: options.examples,
  });

  return JSON.parse(JSON.stringify(s.toJsonSchema(kit.schema)));

  function toDescriptor(
    definition: UiComponentDefinition,
  ): ExposedComponentDescriptor {
    const existing = descriptors.get(definition);
    if (existing) {
      return existing;
    }

    const component =
      'component' in definition && isObject(definition.component)
        ? definition.component
        : definition;
    const descriptor: ExposedComponentDescriptor = {
      ...definition,
      component,
      children: Array.isArray(definition.children)
        ? definition.children.map(toDescriptor)
        : (definition.children as 'any' | 'text' | false | undefined),
    };
    descriptors.set(definition, descriptor);
    return descriptor;
  }
}

function isObject(value: unknown): value is object {
  return (
    (typeof value === 'object' && value !== null) || typeof value === 'function'
  );
}
