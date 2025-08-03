import {
  afterRenderEffect,
  computed,
  Directive,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { getSvgPath } from 'figma-squircle';

@Directive({
  selector: '[wwwSquircle]',
  host: {
    '[style.clip-path]': 'clipPathPropertyValue()',
  },
})
export class Squircle {
  readonly host = inject(ElementRef);
  readonly wwwSquircle = input.required<string>();
  readonly wwwSquircleSmoothing = input<number>(1);
  readonly wwwSquirclePreserveSmoothing = input<boolean>(true);
  readonly box = signal<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  readonly cornerRadius = computed(() => {
    const parts = this.wwwSquircle().split(' ');

    if (parts.length === 1) {
      return {
        topLeft: Number(parts[0]),
        topRight: Number(parts[0]),
        bottomLeft: Number(parts[0]),
        bottomRight: Number(parts[0]),
      };
    }

    if (parts.length === 2) {
      return {
        topLeft: Number(parts[0]),
        topRight: Number(parts[0]),
        bottomLeft: Number(parts[1]),
        bottomRight: Number(parts[1]),
      };
    }

    if (parts.length === 4) {
      return {
        topLeft: Number(parts[0]),
        topRight: Number(parts[1]),
        bottomLeft: Number(parts[2]),
        bottomRight: Number(parts[3]),
      };
    }

    throw new Error('Invalid squircle');
  });
  readonly path = computed(() => {
    const { topLeft, topRight, bottomLeft, bottomRight } = this.cornerRadius();

    return getSvgPath({
      height: this.box().height,
      width: this.box().width,
      topLeftCornerRadius: topLeft,
      topRightCornerRadius: topRight,
      bottomLeftCornerRadius: bottomLeft,
      bottomRightCornerRadius: bottomRight,
      cornerSmoothing: this.wwwSquircleSmoothing(),
      preserveSmoothing: this.wwwSquirclePreserveSmoothing(),
    });
  });
  readonly clipPathPropertyValue = computed(() => {
    return `path('${this.path()}')`;
  });

  constructor() {
    afterRenderEffect({
      read: () => {
        const width = this.host.nativeElement.clientWidth;
        const height = this.host.nativeElement.clientHeight;

        this.box.set({ width, height });
      },
    });
  }
}
