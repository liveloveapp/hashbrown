/** One visible row of the workbench state tree. */
export type WorkbenchTreeRow = {
  /** JSON-pointer style path, for example `/plan/steps/0`. */
  readonly path: string;
  readonly depth: number;
  readonly key: string;
  readonly kind: 'object' | 'array' | 'value';
  /** Number of children, for objects and arrays. */
  readonly size?: number;
  /** Short text for a leaf value. */
  readonly preview?: string;
  /** Whether a branch shows its children. */
  readonly open?: boolean;
};

function isBranch(
  value: unknown,
): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null;
}

function entries(value: Record<string, unknown> | unknown[]) {
  return Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value);
}

function childPath(parent: string, key: string): string {
  return `${parent}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

function previewOf(value: unknown): string {
  if (value === undefined) return 'undefined';
  return JSON.stringify(value) ?? String(value);
}

/**
 * Flattens a value into the rows currently visible in the tree.
 *
 * @param value - The value to show.
 * @param open - The paths of branches that are expanded.
 * @returns The visible rows in display order. Children of closed branches are omitted.
 */
export function workbenchTreeRows(
  value: unknown,
  open: ReadonlySet<string>,
): readonly WorkbenchTreeRow[] {
  if (!isBranch(value)) {
    return [
      {
        path: '',
        depth: 0,
        key: 'value',
        kind: 'value',
        preview: previewOf(value),
      },
    ];
  }
  const rows: WorkbenchTreeRow[] = [];
  const walk = (
    node: Record<string, unknown> | unknown[],
    parent: string,
    depth: number,
  ) => {
    for (const [key, child] of entries(node)) {
      const path = childPath(parent, key);
      if (!isBranch(child)) {
        rows.push({
          path,
          depth,
          key,
          kind: 'value',
          preview: previewOf(child),
        });
        continue;
      }
      const isOpen = open.has(path);
      rows.push({
        path,
        depth,
        key,
        kind: Array.isArray(child) ? 'array' : 'object',
        size: entries(child).length,
        open: isOpen,
      });
      if (isOpen) walk(child, path, depth + 1);
    }
  };
  walk(value, '', 0);
  return rows;
}

/**
 * Chooses which branches start expanded.
 *
 * @param value - The value to show.
 * @returns The root and every branch at depth 1.
 */
export function defaultOpenPaths(value: unknown): ReadonlySet<string> {
  const open = new Set<string>(['']);
  if (isBranch(value)) {
    for (const [key, child] of entries(value)) {
      if (isBranch(child)) open.add(childPath('', key));
    }
  }
  return open;
}

/**
 * Finds the leaves whose value differs between two states.
 *
 * @param previous - The earlier value.
 * @param next - The later value.
 * @returns The paths of leaves in `next` that are new or different.
 */
export function changedPaths(
  previous: unknown,
  next: unknown,
): ReadonlySet<string> {
  const changed = new Set<string>();
  const walk = (before: unknown, after: unknown, path: string) => {
    if (isBranch(after)) {
      const same =
        isBranch(before) && Array.isArray(before) === Array.isArray(after);
      const kids = entries(after);
      if (kids.length === 0 && !same) changed.add(path);
      for (const [key, child] of kids) {
        const prior = same
          ? (before as Record<string, unknown>)[key]
          : undefined;
        walk(prior, child, childPath(path, key));
      }
      return;
    }
    if (isBranch(before) || !Object.is(before, after)) changed.add(path);
  };
  walk(previous, next, '');
  return changed;
}

/**
 * Creates a long-lived expandable tree. It keeps which branches are open
 * across updates, keyed by path. The root and top-level branches open the
 * first time they appear, unless the reader has since closed them.
 *
 * @param options - `label` names the tree for assistive technology.
 * @returns The tree element and an `update` that renders a value, highlighting
 * leaves that differ from `previous` (nothing is highlighted when it is `undefined`).
 */
export function createWorkbenchTree(options: { label: string }): {
  element: HTMLElement;
  update(value: unknown, previous: unknown): void;
} {
  const element = document.createElement('div');
  element.className = 'wb-tree';
  element.setAttribute('role', 'tree');
  element.setAttribute('aria-label', options.label);
  let open: ReadonlySet<string> = new Set();
  // Default-open paths already offered once; the reader's choice wins after that.
  let offered: ReadonlySet<string> = new Set();
  let current: unknown;
  let changed: ReadonlySet<string> = new Set();
  let focusPath: string | undefined;

  const render = () => {
    const fresh = [...defaultOpenPaths(current)].filter(
      (path) => !offered.has(path),
    );
    if (fresh.length) {
      offered = new Set([...offered, ...fresh]);
      open = new Set([...open, ...fresh]);
    }
    const rows = workbenchTreeRows(current, open);
    if (!rows.some((row) => row.path === focusPath)) focusPath = rows[0]?.path;
    const hadFocus = element.contains(element.ownerDocument.activeElement);
    const nodes = rows.map((row) => {
      const node = document.createElement('div');
      node.setAttribute('role', 'treeitem');
      node.dataset.path = row.path;
      node.setAttribute('aria-level', String(row.depth + 1));
      node.tabIndex = row.path === focusPath ? 0 : -1;
      node.style.setProperty('--wb-tree-depth', String(row.depth));
      const hiddenChange =
        row.kind !== 'value' &&
        !row.open &&
        [...changed].some((path) => path.startsWith(`${row.path}/`));
      if (changed.has(row.path) || hiddenChange) node.dataset.changed = '';
      const key = document.createElement('span');
      key.className = 'wb-tree-key';
      key.textContent = row.key;
      node.append(key);
      const detail = document.createElement('span');
      detail.className = 'wb-tree-value';
      if (row.kind === 'value') {
        detail.textContent = row.preview ?? '';
        node.title = row.preview ?? '';
      } else {
        node.setAttribute('aria-expanded', String(!!row.open));
        detail.textContent = `${row.kind === 'array' ? '[' : '{'}${row.size}${row.kind === 'array' ? ']' : '}'}`;
      }
      node.append(detail);
      return node;
    });
    element.replaceChildren(...nodes);
    element.dataset.json = JSON.stringify(current, null, 2) ?? '';
    if (hadFocus) focusRow(focusPath);
  };

  const focusRow = (path: string | undefined) => {
    const row = [
      ...element.querySelectorAll<HTMLElement>('[role=treeitem]'),
    ].find((node) => node.dataset.path === path);
    if (!row) return;
    element.querySelectorAll<HTMLElement>('[role=treeitem]').forEach((node) => {
      node.tabIndex = node === row ? 0 : -1;
    });
    focusPath = path;
    row.focus();
  };

  const setOpen = (path: string, isOpen: boolean) => {
    const next = new Set(open);
    if (isOpen) next.add(path);
    else next.delete(path);
    open = next;
    focusPath = path;
    render();
    focusRow(path);
  };

  const rowOf = (target: EventTarget | null) =>
    target instanceof Element
      ? target.closest<HTMLElement>('[role=treeitem]')
      : null;

  element.addEventListener('click', (event) => {
    const row = rowOf(event.target);
    if (!row || !row.hasAttribute('aria-expanded')) {
      if (row) focusRow(row.dataset.path);
      return;
    }
    setOpen(
      row.dataset.path ?? '',
      row.getAttribute('aria-expanded') !== 'true',
    );
  });

  element.addEventListener('keydown', (event) => {
    const row = rowOf(event.target);
    if (!row) return;
    const items = [...element.querySelectorAll<HTMLElement>('[role=treeitem]')];
    const index = items.indexOf(row);
    const path = row.dataset.path ?? '';
    const expanded = row.getAttribute('aria-expanded');
    const level = Number(row.getAttribute('aria-level'));
    let handled = true;
    if (event.key === 'ArrowDown')
      focusRow(items[index + 1]?.dataset.path ?? path);
    else if (event.key === 'ArrowUp')
      focusRow(items[Math.max(0, index - 1)].dataset.path);
    else if (event.key === 'ArrowRight') {
      if (expanded === 'false') setOpen(path, true);
      else if (
        expanded === 'true' &&
        Number(items[index + 1]?.getAttribute('aria-level')) > level
      )
        focusRow(items[index + 1].dataset.path);
    } else if (event.key === 'ArrowLeft') {
      if (expanded === 'true') setOpen(path, false);
      else {
        const parent = items
          .slice(0, index)
          .reverse()
          .find((item) => Number(item.getAttribute('aria-level')) < level);
        if (parent) focusRow(parent.dataset.path);
      }
    } else if (event.key === 'Enter' && expanded !== null) {
      setOpen(path, expanded !== 'true');
    } else handled = false;
    if (handled) event.preventDefault();
  });

  return {
    element,
    update(value, previous) {
      current = value;
      changed =
        previous === undefined ? new Set() : changedPaths(previous, value);
      render();
    },
  };
}
