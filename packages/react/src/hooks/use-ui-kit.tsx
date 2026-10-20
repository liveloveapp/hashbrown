/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  type ComponentTree,
  type UiKit as CoreUiKit,
  type UiKitInput as CoreUiKitInput,
  type UiWrapper,
  ɵcreateUiKit,
} from '@hashbrownai/core';
import { useCallback, useMemo } from 'react';
import type { ReactElement } from 'react';
import { ExposedComponent } from '../expose-component.fn';
import { renderUiNodes } from './ui-kit.helpers';

function isRenderableComplete(node: ComponentTree[number]): boolean {
  if (!node || typeof node !== 'object') {
    return false;
  }

  const entries = Object.entries(node);
  if (entries.length === 0) {
    return false;
  }

  const value = entries[0]?.[1] as
    | {
        props?: { value?: Record<string, unknown> };
        children?: ComponentTree | string;
      }
    | undefined;

  if (!value?.props?.value) {
    return false;
  }

  if (typeof value.children === 'string' || value.children === undefined) {
    return true;
  }

  return value.children.every((child) => isRenderableComplete(child));
}

const implementationIds = new WeakMap<object, number>();
let nextImplementationId = 0;

/** A stable id per component function, so kits can be compared by them. */
function implementationId(value: unknown): number | null {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function')
  ) {
    return null;
  }
  let id = implementationIds.get(value as object);
  if (id === undefined) {
    id = nextImplementationId++;
    implementationIds.set(value as object, id);
  }
  return id;
}

function implementationKey(kit: CoreUiKit<ExposedComponent<any>>): string {
  return Array.from(kit.registry.values())
    .map(
      (entry) =>
        `${entry.name}:${implementationId(entry.component)}:${implementationId(entry.fallback)}`,
    )
    .join(',');
}

/**
 * Public UiKit input type for React.
 *
 * @public
 */
export type UiKitInput<T extends ExposedComponent<any>> = CoreUiKitInput<T>;

/**
 * Options for the `useUiKit` hook.
 *
 * @public
 */
export interface UiKitOptions<T extends ExposedComponent<any>> {
  /**
   * Components or other UiKit instances to compose.
   */
  components: readonly UiKitInput<T>[];
}

/**
 * UIKit instance for React rendering.
 *
 * @public
 */
export type UiKit<T extends ExposedComponent<any>> = CoreUiKit<T> & {
  /**
   * Render a resolved UI wrapper object into React elements.
   */
  render: (value: UiWrapper) => ReactElement<any>[];
};

/**
 * Creates a UIKit instance for rendering resolved UI wrapper objects.
 *
 * @public
 */
export function useUiKit<T extends ExposedComponent<any>>(
  options: UiKitOptions<T>,
): UiKit<T> {
  const nextKit = useMemo(
    () =>
      ɵcreateUiKit<T>({
        components: options.components,
      }),
    [options.components],
  );
  // The kit keeps its identity while its schema and implementations stay the
  // same, so inline component lists don't churn; a component redefined with
  // a new implementation under the same name still renders the new one.
  const kitKey = `${nextKit.serializedSchema}|${implementationKey(nextKit)}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const uiKit = useMemo(() => nextKit, [kitKey]);
  const render = useCallback(
    (value: UiWrapper) => {
      const nodes = value.ui;
      const isComplete = nodes.every((node) => isRenderableComplete(node));
      if (isComplete) {
        uiKit.schema.validate(value);
      }
      return renderUiNodes(nodes, uiKit.registry) as ReactElement<any>[];
    },
    [uiKit],
  );

  return useMemo(
    () => ({
      ...uiKit,
      render,
    }),
    [uiKit, render],
  );
}
