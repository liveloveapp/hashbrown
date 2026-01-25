/* eslint-disable @typescript-eslint/no-explicit-any */
import { createElement, ReactElement, ReactNode } from 'react';
import { type ComponentNode } from '@hashbrownai/core';
import { ExposedComponent } from '../expose-component.fn';

export function renderUiNodes(
  nodes: string | Array<ComponentNode>,
  registry: ReadonlyMap<string, ExposedComponent<any>>,
  parentKey = '',
): ReactElement[] | string {
  if (typeof nodes === 'string') {
    return nodes;
  }

  return nodes.reduce<ReactElement[]>((acc, element, index) => {
    const key = `${parentKey}_${index}`;
    const entries = Object.entries(element ?? {});
    if (entries.length === 0) {
      return acc;
    }
    const [tagName, node] = entries[0] as [
      string,
      {
        props?: {
          complete: boolean;
          partialValue: any;
          value?: Record<string, any>;
        };
        children?: ComponentNode[] | string;
      },
    ];

    const component = registry.get(tagName);
    if (!component) {
      throw new Error(`Unknown element type. ${tagName}`);
    }

    const propsNode = node?.props;
    if (!propsNode) {
      return acc;
    }

    if (!propsNode.value) {
      if (!component.fallback) {
        return acc;
      }

      acc.push(
        createElement(component.fallback, {
          tag: tagName,
          partialProps: propsNode.partialValue as Record<string, any>,
          key,
        }),
      );
      return acc;
    }

    const children: ReactNode[] | string | null = node?.children
      ? renderUiNodes(node.children, registry, key)
      : null;

    acc.push(
      createElement(component.component, {
        ...propsNode.value,
        children,
        key,
      }),
    );
    return acc;
  }, []);
}
