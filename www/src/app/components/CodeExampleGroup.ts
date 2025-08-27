import {
  Component,
  contentChildren,
  effect,
  ElementRef,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Copy } from '../icons/Copy';
import { CodeExampleGroupItem } from './CodeExampleGroupItem';
import { Squircle } from './Squircle';

@Component({
  selector: 'www-code-example-group',
  imports: [Copy, Squircle],
  template: `
    <div
      class="container"
      wwwSquircle="16"
      [wwwSquircleBorderWidth]="8"
      wwwSquircleBorderColor="var(--gray-light, #a4a3a1)"
    >
      <div class="header">
        <div class="tabs">
          @for (item of items(); track $index; let i = $index) {
            <button [class.active]="i === index()" (click)="index.set(i)">
              {{ item.header() }}
            </button>
          }
        </div>
        <button (click)="onCopy()" aria-label="Copy code to clipboard">
          <www-copy height="16px" width="16px" />
        </button>
      </div>
      <div class="content" #content wwwSquircle="16">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
    }

    .container {
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
          300 13px/18px 'JetBrains Mono',
          sans-serif;

        > .tabs {
          display: flex;
          gap: 24px;

          > button {
            position: relative;

            &.active {
              font-weight: 700;

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
        }

        > button {
          display: flex;
          align-items: center;
          gap: 4px;
          color: #e3e3e3;
          font:
            500 12px/14px 'Poppins',
            sans-serif;
        }
      }

      > .content {
        background: #2b2a29;
        padding: 16px;
        margin: 0 4px 4px 4px;
        flex-grow: 0;
        overflow: auto;
        border-right: 2px solid transparent;
        border-bottom: 2px solid transparent;
        border-left: 2px solid transparent;
        width: calc(100% - 8px);
      }
    }
  `,
})
export class CodeExampleGroup {
  index = signal<number>(0);
  items = contentChildren<CodeExampleGroupItem>(CodeExampleGroupItem);
  contentRef = viewChild<ElementRef<HTMLDivElement>>('content');

  private syncIndex = effect(() => {
    const index = this.index();
    untracked(() => {
      this.items().forEach((item, i) => {
        item.index.set(index);
      });
    });
  });

  private resetIndex = effect(() => {
    this.items();
    this.index.set(0);
  });

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
