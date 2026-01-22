import { Component, computed, input } from '@angular/core';

type Segment =
  | { kind: 'flag'; points: string }
  | { kind: 'barb'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'stem'; x1: number; y1: number; x2: number; y2: number };

@Component({
  selector: 'app-icon-wind-barb',
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      [attr.width]="sizeValue()"
      [attr.height]="sizeValue()"
      viewBox="0 0 24 24"
      [attr.stroke]="color()"
      [attr.stroke-width]="stroke()"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
      class="icon icon-tabler icon-tabler-wind-barb"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />

      @if (isCalm()) {
        <circle cx="12" cy="12" r="3" data-testid="wind-barb-calm" />
      } @else {
        @for (segment of segments(); track $index) {
          @switch (segment.kind) {
            @case ('stem') {
              <line
                [attr.x1]="segment.x1"
                [attr.y1]="segment.y1"
                [attr.x2]="segment.x2"
                [attr.y2]="segment.y2"
                data-testid="wind-barb-stem"
              />
            }
            @case ('flag') {
              <polygon
                [attr.points]="segment.points"
                data-testid="wind-barb-flag"
              />
            }
            @case ('barb') {
              <line
                [attr.x1]="segment.x1"
                [attr.y1]="segment.y1"
                [attr.x2]="segment.x2"
                [attr.y2]="segment.y2"
                [attr.data-testid]="getBarbTestId(segment)"
              />
            }
          }
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class IconWindBarbComponent {
  readonly speedKnots = input.required<number>();
  readonly directionDegrees = input.required<number>();
  readonly size = input<number | string>(24);
  readonly stroke = input(1);
  readonly color = input('currentColor');
  readonly calmThreshold = input(2.5);

  private readonly stem = computed(() => {
    const centerX = 12;
    const centerY = 12;
    const stemLength = 8;
    const angleRad = ((this.normalizedDirection() - 90) * Math.PI) / 180;
    const vx = Math.cos(angleRad);
    const vy = Math.sin(angleRad);

    const round = (value: number) => Math.round(value * 1000) / 1000;

    return {
      start: { x: centerX, y: centerY },
      end: {
        x: round(centerX + vx * stemLength),
        y: round(centerY + vy * stemLength),
      },
      vx,
      vy,
    };
  });

  private readonly normalizedDirection = computed(() => {
    const dir = this.directionDegrees() ?? 0;
    return ((dir % 360) + 360) % 360;
  });

  private readonly units = computed(() => Math.round(this.speedKnots() / 5));
  protected readonly isCalm = computed(
    () => this.units() === 0 || this.speedKnots() < this.calmThreshold(),
  );

  protected readonly sizeValue = computed(() => {
    const raw = this.size();
    return typeof raw === 'number' ? `${raw}` : raw;
  });

  protected readonly segments = computed<Segment[]>(() => {
    if (this.isCalm()) {
      return [];
    }

    const barbSpacing = 2;
    const longBarbLength = 4;
    const shortBarbLength = 2.5;
    const flagLength = 4;
    const initialOffset = 1.5;

    const { end, vx, vy, start } = this.stem();
    const perpX = -vy;
    const perpY = vx;
    const round = (value: number) => Math.round(value * 1000) / 1000;

    const resolvedSegments: Segment[] = [
      { kind: 'stem', x1: start.x, y1: start.y, x2: end.x, y2: end.y },
    ];

    const segments: Array<'flag' | 'long' | 'short'> = [];
    let remaining = this.units();
    while (remaining >= 10) {
      segments.push('flag');
      remaining -= 10;
    }
    while (remaining >= 2) {
      segments.push('long');
      remaining -= 2;
    }
    if (remaining === 1) {
      segments.push('short');
    }

    segments.forEach((segment, index) => {
      const offset = initialOffset + index * barbSpacing;
      const baseX = round(end.x - vx * offset);
      const baseY = round(end.y - vy * offset);

      if (segment === 'flag') {
        const apexX = round(baseX + perpX * flagLength);
        const apexY = round(baseY + perpY * flagLength);
        const tipX = round(baseX - vx * flagLength);
        const tipY = round(baseY - vy * flagLength);

        resolvedSegments.push({
          kind: 'flag',
          points: `${baseX},${baseY} ${apexX},${apexY} ${tipX},${tipY}`,
        });
      } else {
        const length = segment === 'long' ? longBarbLength : shortBarbLength;
        const endX = round(baseX + perpX * length);
        const endY = round(baseY + perpY * length);

        resolvedSegments.push({
          kind: 'barb',
          x1: baseX,
          y1: baseY,
          x2: endX,
          y2: endY,
        });
      }
    });

    return resolvedSegments;
  });

  protected getBarbTestId(segment: { y1: number; y2: number }): string {
    return Math.abs(segment.y2 - segment.y1) > 3
      ? 'wind-barb-long'
      : 'wind-barb-short';
  }
}
