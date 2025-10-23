import { Component, HostListener, input, output } from '@angular/core';
import { Close } from '../icons/Close';

@Component({
  selector: 'www-video-overlay',
  imports: [Close],
  template: `
    @if (open()) {
      <div class="backdrop" (click)="close()" role="presentation"></div>
      <div
        class="bleed"
        role="dialog"
        aria-modal="true"
        aria-label="Video overlay"
      >
        <div class="content">
          <ng-content></ng-content>
        </div>
        <button
          type="button"
          class="close"
          aria-label="Close overlay"
          (click)="close()"
        >
          <www-close />
        </button>
      </div>
    }
  `,
  styles: [
    `
      .backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0 0 0 / 0.4);
        backdrop-filter: blur(24px);
        z-index: 1000;
      }

      .bleed {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1001;
        pointer-events: none;
        padding: 32px;

        > .content {
          max-width: 768px;
          width: 100%;
          pointer-events: auto;
          border-radius: 12px;
          overflow: hidden;

          iframe,
          video {
            width: 100%;
            height: auto;
            display: block;
          }
        }

        > .close {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 40px;
          height: 40px;
          border: none;
          border-radius: 50%;
          background: rgba(0 0 0 / 0.6);
          color: #fff;
          font-size: 24px;
          line-height: 1;
          cursor: pointer;
          pointer-events: auto;
        }
      }

      @media (max-width: 480px) {
        .bleed {
          > .content {
            height: 56.25vw; /* 9 / 16 = 0.5625 */
          }
        }
      }
    `,
  ],
})
export class VideoOverlay {
  open = input(false);
  closed = output<void>();

  close() {
    if (this.open()) {
      this.closed.emit();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') this.close();
  }
}
