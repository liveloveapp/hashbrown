/* eslint-disable @typescript-eslint/no-explicit-any */
import { reflectComponentType } from '@angular/core';
import { s, ɵtypes, ɵui } from '@hashbrownai/core';

/**
 * @public
 */
export type AngularSignalLike<T> = () => T;

/**
 * @public
 */
export type ComponentPropSchema<T> = ɵtypes.Prettify<
  T extends { new (...args: any[]): infer P }
    ? {
        [K in keyof P]?: P[K] extends AngularSignalLike<infer U>
          ? s.Schema<U> | s.StandardJSONSchemaV1<U, U>
          : s.Schema<P[K]> | s.StandardJSONSchemaV1<P[K], P[K]>;
      }
    : never
>;

/**
 * @public
 */
export interface ExposedComponent<T extends { new (...args: any[]): any }> {
  component: T;
  fallback?: { new (...args: any[]): ɵui.ComponentFallbackProps };
  name: string;
  description: string;
  children?: 'any' | 'text' | ExposedComponent<any>[] | false;
  props?: ComponentPropSchema<T>;
}

/**
 * Exposes a component by combining it with additional configuration details.
 *
 * @public
 * @typeParam T - The type of the Angular component.
 * @param component - The Angular component to be exposed.
 * @param config - The configuration object for the component, excluding the component itself.
 * @returns An object representing the exposed component, including the component and its configuration.
 */
export function exposeComponent<T extends { new (...args: any[]): any }>(
  component: T,
  config: ɵtypes.Prettify<
    Omit<ExposedComponent<T>, 'component' | 'name' | 'props'> & {
      input?: ComponentPropSchema<T>;
      name?: string;
    }
  >,
): ExposedComponent<T> {
  const reflected = reflectComponentType(component);

  if (!reflected?.selector) {
    throw new Error(`Could not reflect component: ${component}`);
  }

  const { input, name, ...rest } = config;

  return {
    component,
    ...rest,
    props: input,
    name: name ?? reflected?.selector,
  };
}
