import { Component, computed, input } from '@angular/core';
import { MagicText } from '@hashbrownai/angular';
import { Step } from '../../services/langgraph.service';

@Component({
  selector: 'app-steps',
  imports: [MagicText],
  template: `
    @if (!steps().length) {
      <div class="thinking">
        <hb-magic-text text="Thinking..." />
      </div>
    } @else if (currentStep()) {
      <div class="stepText">
        <hb-magic-text [text]="stepText()" />
      </div>
    }
  `,
  styles: `
    :host {
      min-height: 24px;
      display: flex;
      align-items: center;
      padding: 8px 0;
    }

    .stepText {
      font-size: 14px;
      line-height: 1.5;
      color: rgba(0, 0, 0, 0.7);
    }

    .thinking {
      font-size: 14px;
      color: rgba(0, 0, 0, 0.5);
    }
  `,
})
export class StepsComponent {
  readonly steps = input<Step[]>([]);

  protected readonly currentStep = computed(() => this.steps()[0]);
  protected readonly stepText = computed(() => {
    const step = this.currentStep();
    return step?.prompt || step?.reason || 'Thinking...';
  });
}
