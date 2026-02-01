/* eslint-disable @typescript-eslint/no-explicit-any */
import { JsonResolvedValue, JsonValue } from '../skillet/parser/json-parser';
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
          ? s.Schema<U> | s.StandardJSONSchemaV1<U, U>
          : never;
      }
    : T extends Component<infer P>
      ? {
          [K in keyof P]?: s.Schema<P[K]> | s.StandardJSONSchemaV1<P[K], P[K]>;
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
  fallback?: Component<ComponentFallbackProps>;
}

/**
 * Minimal component descriptor shape accepted by schema helpers.
 *
 * @public
 */
export interface ExposedComponentDescriptor {
  component: object;
  name: string;
  description: string;
  children?: 'any' | 'text' | false | unknown[];
  props?: Record<string, s.HashbrownType | s.StandardJSONSchemaV1>;
  fallback?: unknown;
}

/**
 * @public
 */
export type ComponentFallbackProps = {
  tag: string;
  partialProps?: Record<string, JsonResolvedValue>;
};

/**
 * @public
 */
export type ComponentNode = {
  [tagName: string]: {
    props?: {
      complete: boolean;
      partialValue: JsonResolvedValue;
      value?: Record<string, JsonValue>;
    };
    children?: ComponentNode[] | string;
  };
};

/**
 * @public
 */
export type ComponentTree = ComponentNode[];

/**
 * @public
 */
export type ComponentTreeSchema = s.HashbrownType<ComponentNode>;

/**
 * Wrapper object used for UI kit responses.
 *
 * @public
 */
export interface UiWrapper {
  ui: ComponentTree;
}

/**
 * Flattens a component hierarchy into a map of component names to their definitions.
 * This includes nested components defined in the children property.
 *
 * @public
 */
export function flattenComponents<T extends ExposedComponentDescriptor>(
  components: T[],
): Map<string, T> {
  const componentMap = new Map<string, T>();

  function processComponent(component: T) {
    componentMap.set(component.name, component);

    if (component.children && Array.isArray(component.children)) {
      (component.children as T[]).forEach(processComponent);
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
  components: ExposedComponentDescriptor[],
): ComponentTreeSchema {
  const weakMap = new WeakMap<object, s.HashbrownType>();

  const elements = s.anyOf(
    components.map((component) => createSchema(component)),
  );

  function createSchema(
    component: ExposedComponentDescriptor,
  ): s.HashbrownType {
    if (weakMap.has(component.component)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return weakMap.get(component.component)!;
    }

    const children = component.children;
    const normalizedProps = normalizeComponentProps(component.props);
    const nodeShape: Record<string, s.HashbrownType> = {
      props: s.node(s.object('Component Props', normalizedProps)),
    };

    if (children === 'any') {
      Object.defineProperty(nodeShape, 'children', {
        enumerable: true,
        get: () => s.streaming.array('Child Elements', elements),
      });
    } else if (children === 'text') {
      nodeShape['children'] = s.streaming.string('Content');
    } else if (children && Array.isArray(children)) {
      Object.defineProperty(nodeShape, 'children', {
        enumerable: true,
        get: () =>
          s.streaming.array(
            'Child Elements',
            s.anyOf(
              (children as ExposedComponentDescriptor[]).map((child) =>
                createSchema(child),
              ),
            ),
          ),
      });
    }

    const nodeSchema = s.streaming.object(`${component.name} node`, nodeShape);
    const schema = s.streaming.object(component.description, {
      [component.name]: nodeSchema,
    });

    weakMap.set(component.component, schema);
    return schema;
  }

  return elements as any;
}

function normalizeComponentProps(
  props?: Record<string, s.HashbrownType | s.StandardJSONSchemaV1>,
): Record<string, s.HashbrownType> {
  if (!props) {
    return {};
  }

  const normalized: Record<string, s.HashbrownType> = {};
  for (const [key, schema] of Object.entries(props)) {
    let next: s.HashbrownType | object;
    try {
      next = s.normalizeSchemaInput(schema);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Component prop "${key}" schema normalization failed (mode: input). ${message}`,
      );
    }
    if (!s.isHashbrownType(next)) {
      throw new Error(
        `Component prop "${key}" must be a Skillet schema or Standard JSON Schema.`,
      );
    }
    normalized[key] = next;
  }

  return normalized;
}
