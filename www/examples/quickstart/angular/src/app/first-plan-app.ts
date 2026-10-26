import { ChangeDetectionStrategy, Component } from '@angular/core';
import { s } from '@hashbrownai/core';
import {
  exposeComponent,
  RenderMessageComponent,
  uiChatResource,
} from '@hashbrownai/angular';
import { PlanCard } from './plan-card';

/** The only UI the model may render: validated title and streaming steps. */
export const firstPlanComponents = [
  exposeComponent(PlanCard, {
    name: 'SummaryCard',
    description: 'Show a concise two-step plan as a preview.',
    input: {
      title: s.string('A concise plan title'),
      steps: s.streaming.array(
        'The ordered plan steps',
        s.string('A concise action'),
      ),
    },
    children: false,
  }),
];

/** Generates a plan using the application-owned component and schema. */
@Component({
  selector: 'app-root',
  imports: [RenderMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<main>
    <h1>Your first generated plan</h1>
    <button type="button" [disabled]="chat.isLoading()" (click)="generate()">
      Generate a plan
    </button>
    @if (chat.isLoading()) {
      <p role="status">Creating your plan…</p>
    }
    @if (chat.error()) {
      <p role="alert">Check your server, then try again.</p>
    } @else {
      @for (message of chat.value(); track $index) {
        @if (message.role === 'assistant') {
          <hb-render-message [message]="message" />
        }
      }
    }
  </main>`,
})
export class FirstPlanApp {
  protected readonly chat = uiChatResource({
    system:
      'Help a developer create a small two-step plan for a trusted UI demo. Render exactly one SummaryCard with a short title and exactly two concise steps: outline the demo, then record it. Do not call tools. Rendering is a preview and does not change application state.',
    components: firstPlanComponents,
  });
  protected generate(): void {
    this.chat.sendMessage({
      role: 'user',
      content: 'Create a two-step plan for a trusted UI demo.',
    });
  }
}
