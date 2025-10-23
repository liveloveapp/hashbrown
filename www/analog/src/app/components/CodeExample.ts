import { Component, ElementRef, input, viewChild } from '@angular/core';
import { Copy } from '../icons/Copy';
import { PlayerPlay } from '../icons/PlayerPlay';
import { Squircle } from './Squircle';

@Component({
  selector: 'www-code-example',
  imports: [Copy, PlayerPlay, Squircle],
  template: `
    <div
      class="code-example"
      wwwSquircle="16"
      [wwwSquircleBorderWidth]="8"
      wwwSquircleBorderColor="var(--gray-light, #a4a3a1)"
    >
      <div class="header">
        <span class="active">{{ header() }}</span>
        <div>
          @if (run()) {
            <a [href]="run()">
              <www-player-play height="16px" width="16px" />
              run
            </a>
          }
          @if (copyable()) {
            <button (click)="onCopy()" aria-label="Copy code to clipboard">
              <www-copy height="18px" width="18px" />
            </button>
          }
          <ng-content select="[actions]" />
        </div>
      </div>
      <div class="content" #content wwwSquircle="16">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .code-example {
      display: flex;
      flex-direction: column;
      background: var(--gray, #5e5c5a);
      overflow: hidden;

      > .header {
        display: flex;
        justify-content: space-between;
        padding: 14px 24px 12px 24px;
        color: var(--vanilla-ivory, #faf9f0);
        font:
          400 13px/18px 'JetBrains Mono',
          sans-serif;

        > span {
          display: inline-flex;
          align-items: center;
          position: relative;

          &.active {
            &::before {
              content: '';
              position: absolute;
              bottom: 0;
              left: 0;
              width: 100%;
              height: 3px;
              margin-bottom: -12px;
              border-radius: 1px;
              background: linear-gradient(
                to right,
                #fbbb52 0%,
                var(--sunset-orange) 25%,
                var(--indian-red-light) 50%,
                var(--sky-blue-dark) 75%,
                var(--olive-green-light) 100%
              );
              background-clip: border-box;
            }
          }
        }

        > div {
          display: flex;
          align-items: center;
          gap: 16px;

          > a,
          > button {
            display: flex;
            align-items: center;
            gap: 4px;
            color: #e3e3e3;
            font:
              500 12px/14px 'Fredoka',
              sans-serif;
          }

          > a {
            text-decoration: none;
            color: inherit;
          }
        }
      }

      > .content {
        background: var(--gray-dark, #3d3c3a);
        padding: 16px;
        overflow-x: scroll;
        margin: 0 4px 4px 4px;
      }
    }
  `,
})
export class CodeExample {
  copyable = input<boolean>(true);
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
