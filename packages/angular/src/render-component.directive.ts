import {
  ComponentRef,
  Directive,
  inject,
  input,
  ViewContainerRef,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { RichChat } from './rich-chat-resource.fn';

@Directive({
  selector: 'ng-template[hshRenderComponentMessage]',
  standalone: true,
})
export class RenderComponentMessage implements OnInit, OnDestroy {
  hshRenderComponentMessage =
    input.required<RichChat.ComponentMessage<string, unknown>>();
  viewContainerRef = inject(ViewContainerRef);
  componentRef: ComponentRef<unknown> | null = null;

  ngOnInit() {
    const componentMessage = this.hshRenderComponentMessage();
    this.componentRef = this.viewContainerRef.createComponent(
      componentMessage.component,
    );

    for (const input of Object.keys(componentMessage.inputs)) {
      this.componentRef.setInput(
        input,
        componentMessage.inputs[input as keyof typeof componentMessage.inputs],
      );
    }
  }

  ngOnDestroy() {
    this.componentRef?.destroy();
  }
}
