/* eslint-disable @typescript-eslint/no-explicit-any */
import { s, ɵtypes } from '@hashbrownai/core';
import type { ComponentType } from 'react';

/**
 * When exposing a component to the chat, you must provide a schema for the props of that component.
 * The `ComponentPropSchema` type defines the schema for those component props.
 *
 * @public
 * @example
 * ```ts
 * // Example usage in a tool definition.
 * exposeComponent(CardComponent, {
 *   // ...
 *   props: { // The ComponentPropSchema
 *     title: s.string('The title of the card'),
 *     description: s.streaming.string('The description of the card'),
 *   },
 * });
 * ```
 */
export type ComponentPropSchema<T> = ɵtypes.Prettify<
  T extends ComponentType<infer P>
    ? {
        [K in keyof P]?: s.Schema<P[K]>;
      }
    : never
>;

/**
 * This type defines the configuration for a component to be exposed to the chat.
 *
 * @public
 * @example
 * ```ts
 * exposeComponent(CardComponent, {
 *   name: 'CardComponent',
 *   description: 'Show a card with children components to the user',
 *   children: 'any',
 *   props: {
 *     title: s.string('The title of the card'),
 *     description: s.streaming.string('The description of the card'),
 *   },
 * });
 * ```
 */
export interface ExposedComponent<T extends ComponentType<any>> {
  /**
   * The component to be exposed.
   */
  component: T;
  /**
   * The name of the component.
   */
  name: string;
  /**
   * The description of the component.  This is also used by the LLM to understand when to use the component.
   */
  description: string;
  /**
   * The children of the component.
   */
  children?: 'any' | 'text' | ExposedComponent<any>[] | false;
  /**
   * The schema describing the props for this component.
   */
  props?: ComponentPropSchema<T>;
}

/**
 * Creates an object used to expose a component for use by the LLM.
 *
 * @example
 * ```ts
 * exposeComponent(
 *   CardComponent, // The React component to be exposed.
 *   { // The exposed component configuration.
 *     name: 'CardComponent',
 *     description: 'Show a card with children components to the user',
 *     children: 'any',
 *     props: {
 *       title: s.string('The title of the card'),
 *       description: s.streaming.string('The description of the card'),
 *     },
 *   },
 * });
 * ```
 *
 * @returns An object representing the component in order to expose it to the LLM.
 * @public
 */
export function exposeComponent<T extends ComponentType<any>>(
  /**
   * The component to be exposed.
   */
  component: T,
  /**
   * The configuration object for the component, excluding the component itself.
   */
  config: ɵtypes.Prettify<Omit<ExposedComponent<T>, 'component'>>,
): ExposedComponent<T> {
  return {
    component,
    ...config,
  };
}
