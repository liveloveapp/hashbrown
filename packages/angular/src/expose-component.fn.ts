/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prettify, s } from '@hashbrownai/core';

type AngularSignalLike<T> = () => T;

export type ComponentPropSchema<T> = Prettify<
  T extends { new (...args: any[]): infer P }
    ? {
        [K in keyof P]?: P[K] extends AngularSignalLike<infer U>
          ? s.Schema<U>
          : s.Schema<P[K]>;
      }
    : never
>;

export interface ExposedComponent<T extends { new (...args: any[]): any }> {
  component: T;
  name: string;
  description: string;
  children?: 'any' | ExposedComponent<any>[] | false;
  props?: ComponentPropSchema<T>;
}

/**
 * Exposes a component by combining it with additional configuration details.
 *
 * @template T - The type of the Angular component.
 * @param {T} component - The Angular component to be exposed.
 * @param {Prettify<Omit<ExposedComponent<T>, 'component'>>} config - The configuration object for the component, excluding the component itself.
 * @returns {ExposedComponent<T>} - An object representing the exposed component, including the component and its configuration.
 */
export function exposeComponent<T extends { new (...args: any[]): any }>(
  component: T,
  config: Prettify<Omit<ExposedComponent<T>, 'component'>>,
): ExposedComponent<T> {
  return {
    component,
    ...config,
  };
}
