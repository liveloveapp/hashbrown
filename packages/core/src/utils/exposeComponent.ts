/* eslint-disable @typescript-eslint/no-explicit-any */
import { Component, ExposedComponent } from '../models';
import { Prettify } from './types';
import { s } from '../schema';

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

export type ComponentTree = {
  $tagName: string;
  $children: ComponentTree[];
  $props: Record<string, any>;
};

export type ComponentTreeSchema = {
  [k in keyof ComponentTree]: s.Schema<ComponentTree[k]>;
};

/**
 * Creates a schema for a list of exposed components, allowing for the definition
 * of component structures and their relationships.
 *
 * @param {ExposedComponent<any>[]} components - An array of components to create schemas for.
 * @returns {s.ObjectType<ComponentTree>} - A schema representing the structure of the components.
 */
export function createComponentSchema(
  components: ExposedComponent<any>[],
): s.ObjectType<ComponentTreeSchema> {
  const weakMap = new WeakMap<Component<any>, s.HashbrownType>();

  const elements = s.anyOf(
    components.map((component, discriminator) =>
      createSchema(component, discriminator.toString()),
    ),
  );

  function createSchema(
    component: ExposedComponent<any>,
    discriminator: string,
  ): s.HashbrownType {
    if (weakMap.has(component.component)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return weakMap.get(component.component)!;
    }

    const children = component.children;

    if (children === 'any') {
      const schema = s.object(component.description, {
        __discriminator: s.constString(discriminator),
        $tagName: s.constString(component.name),
        $props: s.object('Props', component.props ?? {}),
        get $children(): any {
          return s.streaming.array('Child Elements', elements);
        },
      });
      weakMap.set(component.component, schema);
      return schema;
    } else if (children && Array.isArray(children)) {
      const schema = s.object(component.description, {
        __discriminator: s.constString(discriminator),
        $tagName: s.constString(component.name),
        $props: s.object('Props', component.props ?? {}),
        get $children(): any {
          return s.streaming.array(
            'Child Elements',
            s.anyOf(
              children.map((child, innerDiscriminator) =>
                createSchema(child, innerDiscriminator.toString()),
              ),
            ),
          );
        },
      });
      weakMap.set(component.component, schema);
      return schema;
    }

    const schema = s.object(component.description, {
      __discriminator: s.constString(discriminator),
      $tagName: s.constString(component.name),
      $props: s.object('Props', component.props ?? {}),
    });
    weakMap.set(component.component, schema);
    return schema;
  }

  return elements as any;
}
