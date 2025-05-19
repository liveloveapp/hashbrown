/* eslint-disable @typescript-eslint/no-explicit-any */
import { s, θtypes } from '@hashbrownai/core';
import type { ComponentType } from 'react';

export type ComponentPropSchema<T> = θtypes.Prettify<
  T extends ComponentType<infer P>
    ? {
        [K in keyof P]?: s.Schema<P[K]>;
      }
    : never
>;

export interface ExposedComponent<T extends ComponentType<any>> {
  component: T;
  name: string;
  description: string;
  children?: 'any' | ExposedComponent<any>[] | false;
  props?: ComponentPropSchema<T>;
}

/**
 * Exposes a component by combining it with additional configuration details.
 *
 * @template T - The type of the component.
 * @param {T} component - The React component to be exposed.
 * @param {Prettify<Omit<ExposedComponent<T>, 'component'>>} config - The configuration object for the component, excluding the component itself.
 * @returns {ExposedComponent<T>} - An object representing the exposed component, including the component and its configuration.
 */
export function exposeComponent<T extends ComponentType<any>>(
  component: T,
  config: θtypes.Prettify<Omit<ExposedComponent<T>, 'component'>>,
): ExposedComponent<T> {
  return {
    component,
    ...config,
  };
}
