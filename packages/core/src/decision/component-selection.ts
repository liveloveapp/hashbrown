/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ExposedComponentDescriptor } from '../ui/expose-component';
import { isUiKit, type UiKit, type UiKitInput } from '../ui/ui-kit';
import { DecisionSchemaError } from './errors';

/**
 * The shape shared by exposed components and component definitions.
 */
interface Selectable {
  name: string;
  description: string;
  children?: unknown;
}

/**
 * A plain group of structural members that mirrors a UI kit without
 * importing component implementations. Pass it to `createSelectionSchema`
 * in place of a UI kit; with `selectable: false` its members are never asked
 * about.
 *
 * @public
 */
export interface SelectionGroup {
  /**
   * The group's members, in the order their kit lists them. Each needs only
   * the `name` and `description` the model reads; `children`, when it is an
   * array of members, adds those members after their parent.
   */
  components: ReadonlyArray<{
    /** The component name, as the UI kit exposes it. */
    name: string;
    /** What the component shows, as the model reads it. */
    description: string;
    /** Nested members, or anything else (such as `false`) for none. */
    children?: unknown;
  }>;
  /**
   * Whether selection may choose among the group's members. Defaults to
   * `true`. When `false`, the members and their children are never asked
   * about, and a name non-selectable here is non-selectable in every group.
   */
  selectable?: boolean;
}

/**
 * A candidate item: an option id and the description the model reads.
 */
interface SelectionItem {
  id: string;
  description: string;
}

/**
 * A flattened entry, tagged once: a top-level candidate item, or a component.
 */
type OrderedEntry<T> =
  { kind: 'item'; item: SelectionItem } | { kind: 'component'; component: T };

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
 * declared position. Only top-level entries are classified this way; kit
 * members and declared children are always components.
 *
 * @returns The flattened components, every entry in declared order, tagged
 * once (`ordered`, which includes candidate items), and, for each name,
 * every object seen with that name.
 */
function flattenSelectable<T extends Selectable>(
  entries: ReadonlyArray<T | UiKit<any> | SelectionGroup | SelectionItem>,
  acceptItems: boolean,
): {
  flat: T[];
  ordered: Array<OrderedEntry<T>>;
  variants: Map<string, Selectable[]>;
  nonSelectable: ReadonlySet<string>;
} {
  const visited = new Set<object>();
  const nonSelectable = new Set<string>();
  const hiddenVisited = new Set<object>();
  const variants = new Map<string, Selectable[]>();
  const flat: T[] = [];
  const ordered: Array<OrderedEntry<T>> = [];

  function add(entry: T): void {
    if (visited.has(entry)) return;
    visited.add(entry);
    const seen = variants.get(entry.name);
    if (seen) {
      variants.set(entry.name, [...seen, entry]);
    } else {
      variants.set(entry.name, [entry]);
      flat.push(entry);
      ordered.push({ kind: 'component', component: entry });
    }
    if (Array.isArray(entry.children)) {
      (entry.children as T[]).forEach(add);
    }
  }

  function hide(entry: Selectable): void {
    if (hiddenVisited.has(entry)) return;
    hiddenVisited.add(entry);
    nonSelectable.add(entry.name);
    if (Array.isArray(entry.children)) {
      (entry.children as Selectable[]).forEach(hide);
    }
  }

  // A name that is non-selectable anywhere is non-selectable everywhere.
  for (const entry of entries) {
    if (isUiKit(entry)) {
      entry.ɵnonSelectable.forEach((name) => nonSelectable.add(name));
    } else if (isSelectionGroup(entry) && entry.selectable === false) {
      entry.components.forEach(hide);
    }
  }

  for (const entry of entries) {
    if (isUiKit(entry)) {
      (entry.components as unknown as T[]).forEach(add);
    } else if (isSelectionGroup(entry)) {
      (entry.components as unknown as T[]).forEach(add);
    } else if (acceptItems && 'id' in entry) {
      ordered.push({ kind: 'item', item: entry });
    } else {
      add(entry as T);
    }
  }
  return { flat, ordered, variants, nonSelectable };
}

function isSelectionGroup(value: unknown): value is SelectionGroup {
  return (
    typeof value === 'object' &&
    value !== null &&
    !('id' in value) &&
    !('name' in value) &&
    // A kit from another copy of core carries more keys; it is not a group.
    Object.keys(value).every(
      (key) => key === 'components' || key === 'selectable',
    ) &&
    Array.isArray((value as { components?: unknown }).components)
  );
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
 * Members of a kit created with `selectable: false` are never options, but
 * `expand` always includes them, whatever was chosen.
 *
 * @param components - Exposed components and/or UI kits.
 * @returns The selection options and an `expand` function.
 *
 * @public
 */
export function createComponentSelection<T extends ExposedComponentDescriptor>(
  components: ReadonlyArray<UiKitInput<T>>,
): ComponentSelection<T> {
  const { flat, variants, nonSelectable } = flattenSelectable<T>(
    components,
    false,
  );

  return {
    options: flat
      .filter((entry) => !nonSelectable.has(entry.name))
      .map(toOption),
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
      nonSelectable.forEach(include);
      ids.filter((id) => variants.has(id)).forEach(include);
      return flat.filter((entry) => included.has(entry.name));
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function describeEntry(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Checks that a top-level entry is a UI kit, a plain group
 * `{ components, selectable? }`, a candidate item
 * `{ id, description }` or a component `{ name, description }`.
 *
 * @throws DecisionSchemaError naming the entry when it matches no shape.
 */
function assertSelectionEntry(entry: unknown, index: number): void {
  if (isUiKit(entry)) return;
  if (isSelectionGroup(entry)) {
    const group = entry as unknown as Record<string, unknown>;
    const members = group['components'] as unknown[];
    const membersValid = members.every(
      (member) =>
        isRecord(member) &&
        typeof member['name'] === 'string' &&
        typeof member['description'] === 'string',
    );
    if (
      !membersValid ||
      (group['selectable'] !== undefined &&
        typeof group['selectable'] !== 'boolean')
    ) {
      throw new DecisionSchemaError(
        `Selection group at index ${index} must have components { name, description } and a boolean selectable (found ${describeEntry(entry)})`,
        '',
      );
    }
    return;
  }
  const valid =
    isRecord(entry) &&
    typeof entry['description'] === 'string' &&
    ('id' in entry
      ? typeof entry['id'] === 'string'
      : typeof entry['name'] === 'string');
  if (!valid) {
    throw new DecisionSchemaError(
      `Selection entry at index ${index} is not a candidate item { id, description }, a component { name, description } or a UI kit (found ${describeEntry(entry)})`,
      '',
    );
  }
}

/**
 * Turns selection entries into options in declared order. A top-level entry
 * with an `id` is a candidate item and becomes `{ id, description }` as is.
 * UI kits and components (top-level entries with a `name` and no `id`) are
 * flattened exactly as {@link createComponentSelection} flattens them, each
 * becoming `{ id: name, description }`; kit members and declared children
 * are always components, whatever other fields they carry.
 *
 * @param entries - Candidate items, components and/or UI kits.
 * @returns One option per candidate item or flattened component.
 * @throws DecisionSchemaError when an entry, or a component reached through
 * a kit or `children`, matches none of these shapes.
 */
export function toSelectionOptions(
  entries: ReadonlyArray<unknown>,
): SelectionItem[] {
  entries.forEach(assertSelectionEntry);
  const { ordered, nonSelectable } = flattenSelectable<Selectable>(
    entries as ReadonlyArray<
      Selectable | UiKit<any> | SelectionGroup | SelectionItem
    >,
    true,
  );
  const visible = ordered.filter(
    (entry) =>
      entry.kind === 'item' || !nonSelectable.has(entry.component.name),
  );
  return visible.map((entry) => {
    if (entry.kind === 'item') {
      return { id: entry.item.id, description: entry.item.description };
    }
    const { component } = entry;
    if (
      !isRecord(component) ||
      typeof component.name !== 'string' ||
      typeof component.description !== 'string'
    ) {
      throw new DecisionSchemaError(
        `A component reached through a UI kit or children is not a component { name, description } (found ${describeEntry(component)})`,
        '',
      );
    }
    return toOption(component);
  });
}
