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

declare const Buffer: any;

@Directive({
  selector: '[wwwSquircle]',
  host: {
    '[style.clip-path]': 'clipPathPropertyValue()',
    '[style.--www-squircle-border-image-url]': 'borderImageUrl()',
    '[style.--www-squircle-border-color]': 'wwwSquircleBorderColor()',
    '[style.--www-squircle-border-width]': 'wwwSquircleBorderWidth() + "px"',
  },
})
export class Squircle {
  readonly host = inject(ElementRef);
  readonly wwwSquircle = input.required<string>();
  readonly wwwSquircleSmoothing = input<number>(1);
  readonly wwwSquirclePreserveSmoothing = input<boolean>(true);
  readonly wwwSquircleBorderWidth = input<number>(0);
  readonly wwwSquircleBorderColor = input<string>('transparent');
  readonly box = signal<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  readonly borderBox = computed(() => {
    const { width, height } = this.box();
    const border = this.wwwSquircleBorderWidth();

    return {
      width: width + border * 2,
      height: height + border * 2,
    };
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
  readonly borderImageUrl = computed(() => {
    const path = this.path();
    const border = this.wwwSquircleBorderWidth();
    const computedBorderColor = getComputedStyle(
      this.host.nativeElement,
    ).getPropertyValue('--www-squircle-border-color');

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
        <path d="${path}" fill="none" style="stroke: ${computedBorderColor}; stroke-width: ${border};" />
      </svg>
    `;

    const base64 =
      typeof btoa === 'function'
        ? btoa(svg)
        : Buffer.from(svg).toString('base64');

    return `url("data:image/svg+xml;base64,${base64}")`;
  });
  constructor() {
    afterRenderEffect({
      read: () => {
        const width = this.host.nativeElement.clientWidth;
        const height = this.host.nativeElement.clientHeight;

        this.box.set({ width, height });
      },
    });

    afterRenderEffect({
      read: () => {
        const width = this.host.nativeElement.clientWidth;
        const height = this.host.nativeElement.clientHeight;

        this.box.set({ width, height });
      },
    });
  }
}
