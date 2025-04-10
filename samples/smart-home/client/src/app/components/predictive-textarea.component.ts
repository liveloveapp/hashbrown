import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  HostListener,
  input,
  output,
  viewChild,
} from '@angular/core';

@Component({
  selector: 'app-predictive-textarea',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="predictive-textarea-container">
      <textarea
        #textareaElement
        [value]="value()"
        (input)="handleValueChange(textareaElement.value)"
        class="predictive-textarea"
      ></textarea>
      <div class="prediction-overlay" *ngIf="displayedPrediction()">
        <span class="current-text">{{ value() }}</span>
        <span class="prediction-text">{{ displayedPrediction() }}</span>
      </div>
    </div>
  `,
  styles: `
    .predictive-textarea-container {
      position: relative;
      width: 100%;
    }

    .predictive-textarea {
      width: 100%;
      resize: vertical;
      min-height: 100px;
      padding: 8px;
      font-family: inherit;
      font-size: inherit;
      border: 1px solid #ccc;
      border-radius: 4px;
      line-height: 1.5;
    }

    .prediction-overlay {
      position: absolute;
      top: 0;
      left: 0;
      padding: 8px;
      pointer-events: none;
      white-space: pre-wrap;
      overflow-wrap: break-word;
      font-family: inherit;
      font-size: inherit;
      line-height: 1.5;
    }

    .current-text {
      visibility: hidden;
    }

    .prediction-text {
      color: #999;
    }
  `,
})
export class PredictiveTextareaComponent implements AfterViewInit {
  textareaElement = viewChild('textareaElement', { read: ElementRef });
  value = input('');
  prediction = input('');

  // Computed values
  displayedPrediction = computed(() => {
    const prediction = this.prediction();
    return prediction ? prediction : '';
  });

  valueChange = output<string>();

  ngAfterViewInit() {
    // Ensure textarea has focus handling
    this.textareaElement()?.nativeElement.addEventListener('focus', () => {
      this.updateTextareaState();
    });
  }

  @HostListener('document:keydown.tab', ['$event'])
  handleTabKey(event: KeyboardEvent) {
    // Only handle tab if we have a prediction
    if (this.displayedPrediction()) {
      // Prevent default tab behavior
      event.preventDefault();

      // Accept the prediction
      this.acceptPrediction();
    }
  }

  handleValueChange(newValue: string) {
    // Emit the change event
    this.valueChange.emit(newValue);

    // Update the textarea state
    this.updateTextareaState();
  }

  acceptPrediction() {
    // Get the current values
    const currentValue = this.value();
    const prediction = this.displayedPrediction();

    // Only proceed if we have a prediction
    if (prediction) {
      // Combine the current value with the prediction
      const newValue = currentValue + prediction;

      // Emit the change
      this.valueChange.emit(newValue);

      // Update the textarea state
      this.updateTextareaState();
    }
  }

  private updateTextareaState() {
    // Ensure the textarea reflects the current state
    // This is needed in some edge cases where the view doesn't update
    const element = this.textareaElement();
    if (element) {
      element.nativeElement.value = this.value();
    }
  }
}
