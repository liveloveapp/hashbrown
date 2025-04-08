import {
  Component,
  computed,
  effect,
  input,
  viewChild,
  Type,
  ViewContainerRef,
  ComponentRef,
} from '@angular/core';
import { AssistantMessage } from '../types'; // adjust path as needed

interface RenderData {
  componentName: string;
  inputs: { [key: string]: any };
}

@Component({
  selector: 'lib-assistant-message',
  standalone: true,
  template: `
    @if (renderData()) {
    <ng-template #componentContainer></ng-template>
    } @else {
    {{ message().content }}
    }
  `,
})
export class AssistantMessageComponent {
  // Define inputs as reactive signals.
  readonly message = input.required<AssistantMessage>();

  readonly components = input.required<{
    [componentName: string]: Type<any>;
  }>();

  // Define the viewChild as a signal.
  readonly container = viewChild('componentContainer', {
    read: ViewContainerRef,
  });

  showComponentToolCalls = computed(() => {
    const msg = this.message();
    const toolCalls = msg?.tool_calls;

    if (!toolCalls) {
      return [];
    }

    return toolCalls.filter((tc) => tc.function.name === 'showComponent');
  });

  // Computed signal to extract render instructions from the message.
  renderData = computed<RenderData | null>(() => {
    const msg = this.message();
    const components = this.components();
    const toolCalls = msg?.tool_calls;

    if (!toolCalls) {
      return null;
    }

    const renderCall = toolCalls.find(
      (tc) => tc.function.name === 'showComponent'
    );

    console.log('RENDER CALL', renderCall);

    if (!renderCall) {
      return null;
    }

    try {
      // Expected arguments: { component: string, inputs?: { ... } }
      const args = JSON.parse(renderCall.function.arguments);
      const componentName = args.ui?.name;

      console.log('COMPONENT NAME', componentName, 'ARGS', args);

      if (componentName && components[componentName]) {
        return { componentName, inputs: args.ui?.inputs || {} };
      } else {
        throw new Error(`Component "${componentName}" not found.`);
      }
    } catch (err) {
      console.error('Failed to parse showComponent arguments:', err);

      return null;
    }
  });

  componentRef?: ComponentRef<any>;

  constructor() {
    effect(() => {
      const rd = this.renderData();
      const containerRef = this.container();
      if (containerRef) {
        containerRef.clear();
        if (rd) {
          const componentClass = this.components()[rd.componentName];
          if (componentClass) {
            this.componentRef = containerRef.createComponent(componentClass);
            // Bind inputs from renderData to the dynamic component.
            for (const [key, value] of Object.entries(rd.inputs)) {
              this.componentRef.setInput(key, value);
            }
          } else {
            console.error(`Component "${rd.componentName}" not found.`);
          }
        }
      }
    });
  }
}
