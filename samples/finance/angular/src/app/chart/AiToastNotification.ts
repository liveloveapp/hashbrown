import { Component, ElementRef, inject, input } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MagicText, MagicTextRenderTextSegment } from '@hashbrownai/angular';

@Component({
  selector: 'app-ai-toast-notification',
  imports: [MatIconButton, MatIcon, MagicText, MagicTextRenderTextSegment],
  template: `
    <div class="content">
      <div class="title">
        <span class="title-text">
          {{ title() }}
        </span>
        <button matIconButton (click)="onClose()">
          <mat-icon inline>close</mat-icon>
        </button>
      </div>
      <div class="message">
        <hb-magic-text
          [text]="message()"
          [isComplete]="true"
          [options]="magicTextOptions"
          [caret]="false"
        >
          <ng-template hbMagicTextRenderTextSegment let-context>
            <span class="segment">
              {{ context.segment.text }}
            </span>
          </ng-template>
        </hb-magic-text>
      </div>
    </div>
  `,
  host: {
    '[class.refusal]': 'type() === "refusal"',
    '[class.success]': 'type() === "success"',
    '[class.info]': 'type() === "info"',
  },
  styles: `
    :host {
      display: block;
      width: 320px;
      height: 0;
      overflow: hidden;
      padding: 16px;
      border-radius: 12px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      transition: background-color 0.3s ease;
      backdrop-filter: blur(5px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-family: 'Fredoka';
      transition:
        opacity 0.3s ease,
        transform 0.3s ease,
        height 0.3s ease;
    }

    :host(.closing) {
      opacity: 0;
      transform: translateX(100%);
    }

    :host(.closed) {
      display: none;
    }

    .title {
      font-size: 15px;
      font-weight: 700;
      color: rgba(0, 0, 0, 0.8);
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    button[matIconButton] {
      padding: 0;
      margin: 0;
      width: 16px;
      height: 16px;
      min-width: 16px;
      font-size: 16px;
    }

    .message {
      font-size: 13px;
      line-height: 1.2;
      color: rgba(0, 0, 0, 0.8);
    }

    .message :where(.hb-magic-text-root) {
      display: block;
    }

    .message :where(p) {
      margin: 0;
    }

    .title-text {
      color: inherit;
    }

    .segment {
      opacity: 1;
      transform: translateY(0);
      transition:
        opacity 0.3s ease,
        transform 0.3s ease;

      @starting-style {
        opacity: 0;
        transform: translateY(-16px);
      }
    }

    :host(.refusal) {
      background-color: rgba(226, 118, 118, 0.72);
    }

    :host(.success) {
      background-color: rgba(255, 255, 255, 0.72);
    }

    :host(.info) {
      background-color: rgba(216, 236, 239, 0.72);
    }
  `,
})
export class AiToastNotification {
  title = input.required<string>();
  message = input.required<string>();
  type = input.required<'refusal' | 'success' | 'info'>();
  host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly magicTextOptions = { segmenter: { granularity: 'word' as const } };

  onClose() {
    this.host.nativeElement.classList.add('closing');

    setTimeout(() => {
      this.host.nativeElement.classList.add('closed');
    }, 300);
  }
}
