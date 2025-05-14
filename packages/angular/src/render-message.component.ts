/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @angular-eslint/component-selector */
import {
  ApplicationRef,
  Component,
  computed,
  EmbeddedViewRef,
  inject,
  input,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';
import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import { getTagNameRegistry, UiAssistantMessage } from './ui-chat-resource.fn';

@Component({
  selector: 'hb-render-message',
  imports: [NgComponentOutlet, NgTemplateOutlet],
  template: `
    <ng-template #nodeTemplateRef let-node="node">
      <ng-template #childrenTemplateRef>
        @for (child of node.$children; track $index) {
          <ng-container
            *ngTemplateOutlet="nodeTemplateRef; context: { node: child }"
          />
        }
      </ng-template>

      @if (node) {
        <ng-container
          *ngComponentOutlet="
            getTagComponent(node.$tagName);
            inputs: node.$props;
            content: getRootNodes(childrenTemplateRef)
          "
        ></ng-container>
      }
    </ng-template>

    @if (content()) {
      @for (node of content(); track $index) {
        <ng-template
          [ngTemplateOutlet]="nodeTemplateRef"
          [ngTemplateOutletContext]="node"
        >
        </ng-template>
        <ng-container
          *ngTemplateOutlet="nodeTemplateRef; context: { node: node }"
        />
      }
    }
  `,
})
export class RenderMessageComponent {
  appRef = inject(ApplicationRef);
  message = input.required<UiAssistantMessage<any>>();
  content = computed(() => this.message().content?.ui ?? []);
  tagNameRegistry = computed(() => getTagNameRegistry(this.message()));
  viewContainerRef = inject(ViewContainerRef);
  rootNodesWeakMap = new WeakMap<TemplateRef<any>, any[]>();
  embeddedViewsWeakMap = new WeakMap<TemplateRef<any>, EmbeddedViewRef<any>>();

  getTagComponent(tagName: string) {
    return this.tagNameRegistry()?.[tagName]?.component ?? null;
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
