import { Component, ElementRef, input, viewChild } from '@angular/core';
import { Copy } from '../icons/Copy';
import { PlayerPlay } from '../icons/PlayerPlay';

@Component({
  selector: 'www-code-example',
  imports: [Copy, PlayerPlay],
  template: `
    <div class="header">
      <span>{{ header() }}</span>
      <div>
        @if (run()) {
          <a [href]="run()">
            <www-player-play height="16px" width="16px" />
            run
          </a>
        }
        <button (click)="onCopy()" aria-label="Copy code to clipboard">
          <www-copy height="16px" width="16px" />
          copy
        </button>
      </div>
    </div>
    <div class="content" #content>
      <ng-content />
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        border: 1px solid #000;
        border-radius: 12px;
        margin: 14px 0 24px;
        overflow: hidden;
      }

      .header {
        display: flex;
        justify-content: space-between;
        padding: 8px 16px;
        border-bottom: 1px solid #000;
        font-size: 12px;
        font-weight: 500;
        color: rgba(61, 60, 58, 0.88);

        > div {
          display: flex;
          align-items: center;
          gap: 16px;

          > a,
          > button {
            display: flex;
            align-items: center;
            gap: 4px;
            font:
              500 12px/14px 'Poppins',
              sans-serif;
          }

          > a {
            text-decoration: none;
            color: inherit;
          }
        }
      }

      .content {
        background: #3d3c3a;
        padding: 16px;
        overflow-x: scroll;
      }
    `,
  ],
})
export class CodeExample {
  header = input<string>('');
  run = input<string | undefined>(undefined);
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
