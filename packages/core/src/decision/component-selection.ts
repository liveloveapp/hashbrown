/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ExposedComponentDescriptor } from '../ui/expose-component';
import { isUiKit, type UiKit, type UiKitInput } from '../ui/ui-kit';

/**
 * The shape shared by exposed components and component definitions.
 */
interface Selectable {
  name: string;
  description: string;
  children?: unknown;
}

/**
 * A component or UI kit accepted by {@link componentSelectionOptions}.
 *
 * A component is anything with a `name` and a `description`, such as an
 * `exposeComponent` result or a `UiComponentDefinition`. When `children` is
 * an array, its entries are components too.
 *
 * @public
 */
export type ComponentSelectionInput =
  { name: string; description: string; children?: unknown } | UiKit<any>;

/**
 * The options and expansion for narrowing a component list with a decision.
 *
 * @public
 */
export interface ComponentSelection<T extends ExposedComponentDescriptor> {
  /** One option per flattened component: id = `name`, in declared order. */
  options: Array<{ id: string; description: string }>;
  /**
   * The chosen components plus, recursively, the components declared in their
   * `children` arrays, in declared order. Unknown ids are ignored.
   */
  expand: (ids: readonly string[]) => T[];
}

/**
 * Flattens components and UI kits like `createUiKit` normalizes them: deduped
 * by name (the first wins), in declared order. A kit contributes its
 * normalized `components`; a component contributes itself followed by its
 * declared children, depth first. As in `createUiKit`, the children of a
 * duplicate name are still visited. Each object is visited once, so cycles
 * terminate.
 *
 * @returns The flattened components and, for each name, every object seen
 * with that name.
 */
function flattenSelectable<T extends Selectable>(
  entries: ReadonlyArray<T | UiKit<any>>,
): { flat: T[]; variants: Map<string, Selectable[]> } {
  const visited = new Set<object>();
  const variants = new Map<string, Selectable[]>();
  const flat: T[] = [];

  function add(entry: T): void {
    if (visited.has(entry)) return;
    visited.add(entry);
    const seen = variants.get(entry.name);
    if (seen) {
      variants.set(entry.name, [...seen, entry]);
    } else {
      variants.set(entry.name, [entry]);
      flat.push(entry);
    }
    if (Array.isArray(entry.children)) {
      (entry.children as T[]).forEach(add);
    }
  }

  for (const entry of entries) {
    if (isUiKit(entry)) {
      (entry.components as unknown as T[]).forEach(add);
    } else {
      add(entry as T);
    }
  }
  return { flat, variants };
}

function toOption({ name, description }: Selectable): {
  id: string;
  description: string;
} {
  return { id: name, description };
}

/**
 * Builds the options a UI selection decision asks over for a component list,
 * and expands the chosen ids into the components for the UI completion.
 *
 * UI kits are flattened into their members and every component, including
 * declared children, is an option. `expand` returns the chosen components
 * plus, recursively, their declared children, so a chosen parent always
 * brings the children it allows. Shared by `useUiDecision` and
 * `uiDecisionResource`; {@link componentSelectionOptions} returns the same
 * options for servers.
 *
 * @param components - Exposed components and/or UI kits.
 * @returns The selection options and an `expand` function.
 *
 * @public
 */
export function createComponentSelection<T extends ExposedComponentDescriptor>(
  components: ReadonlyArray<UiKitInput<T>>,
): ComponentSelection<T> {
  const { flat, variants } = flattenSelectable<T>(components);

  return {
    options: flat.map(toOption),
    expand: (ids) => {
      const included = new Set<string>();
      const include = (name: string): void => {
        if (included.has(name)) return;
        included.add(name);
        for (const entry of variants.get(name) ?? []) {
          if (Array.isArray(entry.children)) {
            (entry.children as Selectable[]).forEach((child) =>
              include(child.name),
            );
          }
        }
      };
      ids.filter((id) => variants.has(id)).forEach(include);
      return flat.filter((entry) => included.has(entry.name));
    },
  };
}

/**
 * Returns the options `useUiDecision` and `uiDecisionResource` decide over in
 * narrowing mode, in the same order, for pinning the selection questions on a
 * server.
 *
 * UI kits are flattened into their members, declared children are included,
 * and components are deduped by name. Each option's id is the component's
 * `name` and its description is the component's `description`. Pass the
 * result to {@link createSelectionSchema} with the same `select` the client
 * uses, and the server asks byte-identical questions.
 *
 * @example
 * ```ts
 * // Shared by the app and the server:
 * const definitions = [flightCard, airportCard, weatherCard];
 *
 * // On the server:
 * const schema = createSelectionSchema(
 *   componentSelectionOptions(definitions),
 *   { max: 2 },
 * );
 * ```
 *
 * @param components - Component definitions, `exposeComponent` results
 * and/or UI kits, in the order passed to the hook or resource.
 * @returns The selection options, one per component.
 *
 * @public
 */
export function componentSelectionOptions(
  components: ReadonlyArray<ComponentSelectionInput>,
): Array<{ id: string; description: string }> {
  return flattenSelectable<Selectable>(components).flat.map(toOption);
}
