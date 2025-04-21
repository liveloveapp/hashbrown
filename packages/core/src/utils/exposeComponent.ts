import { Component, ExposedComponent } from '../models';
import { Prettify } from './types';

/**
 * Exposes a component by combining it with additional configuration details.
 *
 * @template T - The type of the component's props.
 * @param {Component<T>} component - The component to be exposed, which can be either an Angular-like or React-like component.
 * @param {Prettify<Omit<ExposedComponent<T>, 'component'>>} config - The configuration object for the component, excluding the component itself.
 * @returns {ExposedComponent<T>} - An object representing the exposed component, including the component and its configuration.
 */
export function exposeComponent<T extends Component<any>>(
  component: T,
  config: Prettify<Omit<ExposedComponent<T>, 'component'>>,
): ExposedComponent<T> {
  return {
    component,
    ...config,
  };
}
