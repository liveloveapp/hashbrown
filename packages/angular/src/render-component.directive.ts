import {
  ComponentRef,
  Directive,
  inject,
  input,
  ViewContainerRef,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { RichComponentMessage } from './rich-chat-resource.fn';

@Directive({
  // eslint-disable-next-line @angular-eslint/directive-selector
  selector: 'ng-template[hshRenderComponentMessage]',
  standalone: true,
})
// eslint-disable-next-line @angular-eslint/directive-class-suffix
export class RenderComponentMessage implements OnInit, OnDestroy {
  hshRenderComponentMessage =
    input.required<RichComponentMessage<string, unknown>>();
  viewContainerRef = inject(ViewContainerRef);
  componentRef: ComponentRef<unknown> | null = null;

  ngOnInit() {
    const componentMessage = this.hshRenderComponentMessage();
    this.componentRef = this.viewContainerRef.createComponent(
      componentMessage.component
    );

    for (const input of Object.keys(componentMessage.inputs)) {
      this.componentRef.setInput(
        input,
        componentMessage.inputs[input as keyof typeof componentMessage.inputs]
      );
    }
  }

  ngOnDestroy() {
    this.componentRef?.destroy();
  }
}
