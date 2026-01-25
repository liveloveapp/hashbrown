/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  type ComponentTree,
  type UiKit as CoreUiKit,
  type UiKitInput as CoreUiKitInput,
  ɵcreateUiKit,
} from '@hashbrownai/core';
import { useCallback, useMemo } from 'react';
import type { ReactElement } from 'react';
import { ExposedComponent } from '../expose-component.fn';
import { renderUiNodes } from './ui-kit.helpers';

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
   * Render resolved UI JSON values into React elements.
   */
  render: (value: ComponentTree) => ReactElement[];
};

/**
 * Creates a UIKit instance for rendering resolved UI JSON values.
 *
 * @public
 */
export function useUiKit<T extends ExposedComponent<any>>(
  options: UiKitOptions<T>,
): UiKit<T> {
  const nextKit = useMemo(
    () => ɵcreateUiKit<T>({ components: options.components }),
    [options.components],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const uiKit = useMemo(() => nextKit, [nextKit.serializedSchema]);
  const render = useCallback(
    (value: ComponentTree) => {
      value.forEach((node) => uiKit.schema.validate(node));
      return renderUiNodes(value, uiKit.registry) as ReactElement[];
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
