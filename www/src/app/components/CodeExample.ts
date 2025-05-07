import { Component, ElementRef, input, viewChild } from '@angular/core';
import { Copy } from '../icons/Copy';

@Component({
  selector: 'www-code-example',
  imports: [Copy],
  template: `
    <div class="header">
      <span>{{ header() }}</span>
      <button (click)="onCopy()" aria-label="Copy code to clipboard">
        <www-copy height="16px" width="16px" />
        copy
      </button>
    </div>
    <div class="content" #content>
      <ng-content></ng-content>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        border: 1px solid rgba(61, 60, 58, 0.24);
        border-radius: 12px;
        margin: 14px 0 24px;
        overflow: hidden;
      }

      .header {
        display: flex;
        justify-content: space-between;
        padding: 8px 16px;
        background-color: rgba(61, 60, 58, 0.08);
        border-bottom: 1px solid rgba(61, 60, 58, 0.24);
        font-size: 12px;
        font-weight: 500;
        color: rgba(61, 60, 58, 0.88);

        > button {
          display: flex;
          align-items: center;
          gap: 8px;
        }
      }

      .content {
        background: rgba(61, 60, 58, 0.04);
        padding: 16px;
        overflow-x: scroll;
      }
    `,
  ],
})
export class CodeExample {
  header = input<string>('');
  contentRef = viewChild<ElementRef<HTMLDivElement>>('content');

  async onCopy() {
    const el = this.contentRef()?.nativeElement;
    if (!el) {
      return;
    }

    const text = el.innerText || el.textContent || '';
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Copy failed', err);
    }
  }
}
