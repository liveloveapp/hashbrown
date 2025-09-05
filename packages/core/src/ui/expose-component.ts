/* eslint-disable @typescript-eslint/no-explicit-any */
import { s } from '../schema';
import { Prettify } from '../utils';

/**
 * @public
 */
export type Component<T = any> =
  | { new (...args: any[]): T } // Angular
  | ((props: T) => any); // React (and probably Vue?)

/**
 * @public
 */
export type AngularSignalLike<T> = () => T;

/**
 * @public
 */
export type ComponentPropSchema<T> = Prettify<
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

/**
 * @public
 */
export interface ExposedComponent<T extends Component<unknown>> {
  component: T;
  name: string;
  description: string;
  children?: 'any' | 'text' | ExposedComponent<any>[] | false;
  props?: ComponentPropSchema<T>;
}

/**
 * @public
 */
export type ComponentTree = {
  $tag: string;
  $children: ComponentTree[];
  $props: Record<string, any>;
};

/**
 * @public
 */
export type ComponentTreeSchema = {
  [k in keyof ComponentTree]: s.Schema<ComponentTree[k]>;
};

/**
 * Flattens a component hierarchy into a map of component names to their definitions.
 * This includes nested components defined in the children property.
 *
 * @public
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
 * @public
 * @param components - An array of components to create schemas for.
 * @returns A schema representing the structure of the components.
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
        $tag: s.literal(component.name),
        $props: s.object('Component Props', component.props ?? {}),
        get $children(): any {
          return s.streaming.array('Child Elements', elements);
        },
      });

      weakMap.set(component.component, schema);
      return schema;
    } else if (children === 'text') {
      const schema = s.object(component.description, {
        $tag: s.literal(component.name),
        $props: s.object('Component Props', component.props ?? {}),
        $children: s.streaming.string('Content'),
      });

      weakMap.set(component.component, schema);
      return schema;
    } else if (children && Array.isArray(children)) {
      const schema = s.object(component.description, {
        $tag: s.literal(component.name),
        $props: s.object('Component Props', component.props ?? {}),
        get $children(): any {
          return s.streaming.array(
            'Child Elements',
            s.anyOf(children.map((child) => createSchema(child))),
          );
        },
      });

      weakMap.set(component.component, schema);
      return schema;
    } else {
      const schema = s.object(component.description, {
        $tag: s.literal(component.name),
        $props: s.object('Component Props', component.props ?? {}),
      });
      weakMap.set(component.component, schema);
      return schema;
    }

    throw new Error(`Invalid children type: ${children}`);
  }

  return elements as any;
}
