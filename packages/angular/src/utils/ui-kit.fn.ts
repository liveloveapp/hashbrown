/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  type UiKit as CoreUiKit,
  type UiKitInput as CoreUiKitInput,
  ɵcreateUiKit as createCoreUiKit,
  type SystemPrompt,
} from '@hashbrownai/core';
import { ExposedComponent } from './expose-component.fn';
import { TagNameRegistry } from './ui-chat.helpers';

/**
 * Public UiKit input type for Angular.
 *
 * @public
 */
export type UiKitInput<T extends ExposedComponent<any>> = CoreUiKitInput<T>;

/**
 * Options for the `createUiKit` helper.
 *
 * @public
 */
export interface UiKitOptions<T extends ExposedComponent<any>> {
  /**
   * Components or other UiKit instances to compose.
   */
  components: readonly UiKitInput<T>[];
  /**
   * Optional prompt-based UI examples to include in the wrapper schema description.
   */
  examples?: SystemPrompt;
}

/**
 * UIKit instance for Angular rendering.
 *
 * @public
 */
export type UiKit<T extends ExposedComponent<any>> = CoreUiKit<T> & {
  /**
   * Tag-name registry used by `hb-render-message`.
   */
  tagNameRegistry: TagNameRegistry;
};

/**
 * Creates a UIKit instance for rendering resolved UI JSON values.
 *
 * @public
 */
export function createUiKit<T extends ExposedComponent<any>>(
  options: UiKitOptions<T>,
): UiKit<T> {
  const uiKit = createCoreUiKit<T>({
    components: options.components,
    examples: options.examples,
  });

  const tagNameRegistry = Array.from(uiKit.registry.values()).reduce(
    (acc, component) => {
      acc[component.name] = {
        props: component.props ?? {},
        component: component.component as any,
        fallback: component.fallback as any,
      };
      return acc;
    },
    {} as TagNameRegistry,
  );

  return {
    ...uiKit,
    tagNameRegistry,
  };
}
