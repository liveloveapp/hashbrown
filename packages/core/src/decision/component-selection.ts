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
 * A candidate item: an option id and the description the model reads.
 */
interface SelectionItem {
  id: string;
  description: string;
}

/**
 * An entry accepted by `createSelectionSchema`: a candidate item, a component
 * or a UI kit.
 */
export type SelectionEntry =
  | SelectionItem
  | { name: string; description: string; children?: unknown }
  | UiKit<any>;

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
 * With `acceptItems`, a top-level entry with an `id` is a candidate item: it
 * is kept as is (not deduped or flattened) and appears in `ordered` at its
 * declared position.
 *
 * @returns The flattened components, every entry in declared order
 * (`ordered`, which includes candidate items), and, for each name, every
 * object seen with that name.
 */
function flattenSelectable<T extends Selectable>(
  entries: ReadonlyArray<T | UiKit<any> | SelectionItem>,
  acceptItems: boolean,
): {
  flat: T[];
  ordered: Array<T | SelectionItem>;
  variants: Map<string, Selectable[]>;
} {
  const visited = new Set<object>();
  const variants = new Map<string, Selectable[]>();
  const flat: T[] = [];
  const ordered: Array<T | SelectionItem> = [];

  function add(entry: T): void {
    if (visited.has(entry)) return;
    visited.add(entry);
    const seen = variants.get(entry.name);
    if (seen) {
      variants.set(entry.name, [...seen, entry]);
    } else {
      variants.set(entry.name, [entry]);
      flat.push(entry);
      ordered.push(entry);
    }
    if (Array.isArray(entry.children)) {
      (entry.children as T[]).forEach(add);
    }
  }

  for (const entry of entries) {
    if (isUiKit(entry)) {
      (entry.components as unknown as T[]).forEach(add);
    } else if (acceptItems && 'id' in entry) {
      ordered.push(entry);
    } else {
      add(entry as T);
    }
  }
  return { flat, ordered, variants };
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
 * `uiDecisionResource`; `createSelectionSchema` flattens components the same
 * way for servers.
 *
 * @param components - Exposed components and/or UI kits.
 * @returns The selection options and an `expand` function.
 *
 * @public
 */
export function createComponentSelection<T extends ExposedComponentDescriptor>(
  components: ReadonlyArray<UiKitInput<T>>,
): ComponentSelection<T> {
  const { flat, variants } = flattenSelectable<T>(components, false);

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
 * Turns selection entries into options in declared order. An entry with an
 * `id` is a candidate item and becomes `{ id, description }` as is. UI kits
 * and components (entries with a `name` and no `id`) are flattened exactly as
 * {@link createComponentSelection} flattens them, each becoming
 * `{ id: name, description }`.
 *
 * @param entries - Candidate items, components and/or UI kits.
 * @returns One option per candidate item or flattened component.
 */
export function toSelectionOptions(
  entries: ReadonlyArray<SelectionEntry>,
): SelectionItem[] {
  return flattenSelectable<Selectable>(entries, true).ordered.map((entry) =>
    'id' in entry
      ? { id: entry.id, description: entry.description }
      : toOption(entry),
  );
}
