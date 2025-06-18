/* eslint-disable @typescript-eslint/no-explicit-any */
import { s } from '../schema';
import { Prettify } from './types';

type Component<T = any> =
  | { new (...args: any[]): T } // Angular
  | ((props: T) => any); // React (and probably Vue?)

type AngularSignalLike<T> = () => T;

type ComponentPropSchema<T> = Prettify<
  T extends Component<infer P>
    ? {
        [K in keyof P]?: P[K] extends AngularSignalLike<infer U>
          ? s.Schema<U>
          : never;
      }
    : T extends Component<infer P>
      ? {
          [K in keyof P]?: s.Schema<P[K]>;
        }
      : never
>;

interface ExposedComponent<T extends Component<unknown>> {
  component: T;
  name: string;
  description: string;
  children?: 'any' | ExposedComponent<any>[] | false;
  props?: ComponentPropSchema<T>;
}

type ComponentTree = {
  $tagName: string;
  $children: ComponentTree[];
  $props: Record<string, any>;
};

export type ComponentTreeSchema = {
  [k in keyof ComponentTree]: s.Schema<ComponentTree[k]>;
};

/**
 * Flattens a component hierarchy into a map of component names to their definitions.
 * This includes nested components defined in the children property.
 */
export function flattenComponents(
  components: ExposedComponent<any>[],
): Map<string, ExposedComponent<any>> {
  const componentMap = new Map<string, ExposedComponent<any>>();

  function processComponent(component: ExposedComponent<any>) {
    componentMap.set(component.name, component);

    if (component.children && Array.isArray(component.children)) {
      component.children.forEach(processComponent);
    }
  }

  components.forEach(processComponent);

  return componentMap;
}

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
    components.map((component) => createSchema(component)),
  );

  function createSchema(component: ExposedComponent<any>): s.HashbrownType {
    if (weakMap.has(component.component)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return weakMap.get(component.component)!;
    }

    const children = component.children;

    if (children === 'any') {
      const schema = s.object(component.description, {
        $tagName: s.literal(component.name),
        $props: s.object('Props', component.props ?? {}),
        get $children(): any {
          return s.streaming.array('Child Elements', elements);
        },
      });

      weakMap.set(component.component, schema);
      return schema;
    } else if (children && Array.isArray(children)) {
      const schema = s.object(component.description, {
        $tagName: s.literal(component.name),
        $props: s.object('Props', component.props ?? {}),
        get $children(): any {
          return s.streaming.array(
            'Child Elements',
            s.anyOf(children.map((child) => createSchema(child))),
          );
        },
      });

      weakMap.set(component.component, schema);
      return schema;
    }

    const schema = s.object(component.description, {
      $tagName: s.literal(component.name),
      $props: s.object('Props', component.props ?? {}),
    });
    weakMap.set(component.component, schema);
    return schema;
  }

  return elements as any;
}
