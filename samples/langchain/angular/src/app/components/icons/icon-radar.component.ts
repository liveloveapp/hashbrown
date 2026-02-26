import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-icon-radar',
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      [attr.width]="sizeValue()"
      [attr.height]="sizeValue()"
      viewBox="0 -20 320 220"
      preserveAspectRatio="xMidYMid meet"
    >
      <g>
        <circle
          cx="160"
          cy="90"
          r="40"
          fill="none"
          stroke="rgba(100, 175, 181, 1)"
          stroke-width="1"
        />
        <circle
          cx="160"
          cy="90"
          r="75"
          fill="none"
          stroke="rgba(100, 175, 181, 1)"
          stroke-width="1"
          stroke-dasharray="4 4"
        />
        <circle
          cx="160"
          cy="90"
          r="110"
          fill="none"
          stroke="rgba(100, 175, 181, 1)"
          stroke-width="1"
          opacity="0.6"
        />
        <g class="radar-arm">
          <line
            x1="160"
            y1="90"
            x2="160"
            y2="-20"
            stroke="rgba(100, 175, 181, 1)"
            stroke-width="1.5"
            opacity="0.8"
          />
          <path
            d="M160,90 L160,-20 A110,110 0 0,0 50,90 Z"
            fill="rgba(158, 207, 215, 1)"
            opacity="0.16"
          />
        </g>
      </g>
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .radar-arm {
      transform-origin: 160px 90px;
      animation: spin 6s linear infinite;
    }

    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }
  `,
})
export class IconRadarComponent {
  readonly size = input<number | string>(24);

  protected readonly sizeValue = computed(() => {
    const raw = this.size();
    return typeof raw === 'number' ? `${raw}` : raw;
  });
}
