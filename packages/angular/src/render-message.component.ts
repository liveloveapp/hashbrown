/* eslint-disable @angular-eslint/component-selector */
import {
  Component,
  EmbeddedViewRef,
  inject,
  input,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { ComponentTree } from '@hashbrownai/core';
import { RenderableMessage } from './rich-chat-resource.fn';

@Component({
  selector: 'hb-render-message',
  imports: [NgComponentOutlet],
  template: `
    @for (node of message().content; track $index) {
      <ng-template #content>
        <hb-render-message [message]="getChildMessage(node)" />
      </ng-template>

      <ng-container
        *ngComponentOutlet="
          getTagComponent(node.$tagName);
          inputs: getInputs(node);
          content: getRootNodes(content)
        "
      ></ng-container>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
    }
  `,
})
export class RenderMessageComponent {
  viewContainerRef = inject(ViewContainerRef);
  inputsWeakMap = new WeakMap<ComponentTree, Record<string, unknown>>();
  childrenWeakMap = new WeakMap<ComponentTree, RenderableMessage>();
  embeddedViewsWeakMap = new WeakMap<TemplateRef<any>, EmbeddedViewRef<any>>();
  rootNodesWeakMap = new WeakMap<TemplateRef<any>, Node[][]>();
  message = input.required<RenderableMessage>();

  getTagComponent(tagName: string) {
    return this.message().tags[tagName].component;
  }

  getInputs(node: ComponentTree) {
    if (this.inputsWeakMap.has(node)) {
      return this.inputsWeakMap.get(node);
    }

    const { $tagName, $children, $props } = node;
    this.inputsWeakMap.set(node, $props);
    return $props;
  }

  getChildMessage(node: ComponentTree): RenderableMessage {
    if (this.childrenWeakMap.has(node)) {
      return this.childrenWeakMap.get(node)!;
    }

    const message = {
      content: node.$children ?? [],
      tags: this.message().tags,
    };
    this.childrenWeakMap.set(node, message);
    return message;
  }

  getEmbeddedView(tpl: TemplateRef<any>) {
    if (this.embeddedViewsWeakMap.has(tpl)) {
      return this.embeddedViewsWeakMap.get(tpl)!;
    }

    const view = this.viewContainerRef.createEmbeddedView(tpl);
    this.embeddedViewsWeakMap.set(tpl, view);
    return view;
  }

  getRootNodes(tpl: TemplateRef<any>) {
    if (this.rootNodesWeakMap.has(tpl)) {
      return this.rootNodesWeakMap.get(tpl)!;
    }

    const view = this.getEmbeddedView(tpl);
    const nodes = [view.rootNodes];
    this.rootNodesWeakMap.set(tpl, nodes);
    return nodes;
  }
}
