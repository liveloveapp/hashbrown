import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'spot-loader',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="loader-container">
      <div class="progress-bar">
        <div class="progress-fill"></div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        position: fixed;
      }

      .loader-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
      }

      .progress-bar {
        width: 100vw;
        height: 8px;
        background-color: var(--sunshine-yellow-dark);
        overflow: hidden;
        position: relative;
      }

      .progress-fill {
        height: 100%;
        background: linear-gradient(
          90deg,
          var(--sunshine-yellow),
          var(--sunshine-yellow-light),
          var(--sunshine-yellow)
        );
        animation: progress-animation 2s ease-in-out infinite;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
      }

      @keyframes progress-animation {
        0% {
          transform: translateX(-100%);
        }
        50% {
          transform: translateX(0%);
        }
        100% {
          transform: translateX(100%);
        }
      }
    `,
  ],
})
export class LoaderComponent {
  // Component logic can be added here if needed
}
