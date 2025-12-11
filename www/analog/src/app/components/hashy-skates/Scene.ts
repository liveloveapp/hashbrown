import { Component, effect, ElementRef, inject } from '@angular/core';
import { fromEvent, tap } from 'rxjs';
import { Clouds } from './Clouds';
import { Forest } from './Forest';
import { Skateboard } from './Skateboard';
import { Hashy } from './Hashy';
import { Shadow } from './Shadow';

@Component({
  selector: 'www-hashy-skates-scene',
  standalone: true,
  imports: [Clouds, Forest, Skateboard, Shadow, Hashy],
  template: `
    <svg:svg
      viewBox="0 0 2000 2000"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <svg:g hb-hashy-skates-clouds></svg:g>
      <svg:g hb-hashy-skates-forest></svg:g>
      <svg:g hb-hashy-skates-shadow></svg:g>
      <svg:g hb-hashy-skates-hashy></svg:g>
      <svg:g hb-hashy-skates-skateboard></svg:g>
    </svg:svg>
  `,
  styles: `
    svg {
      width: 100%;
      height: auto;
    }
  `,
})
export class Scene {
  elementRef = inject<ElementRef<SVGSVGElement>>(ElementRef);

  // motion tuning
  private readonly stiffness = 0.12; // higher = snappier
  private readonly damping = 0.04; // higher = more resistance

  constructor() {
    effect((teardown) => {
      const svg = this.elementRef.nativeElement;
      const clouds = svg.querySelector<SVGGElement>(
        'g[hb-hashy-skates-clouds]',
      );
      const forest = svg.querySelector<SVGGElement>(
        'g[hb-hashy-skates-forest]',
      );
      const hashy = svg.querySelector<SVGGElement>('g[hb-hashy-skates-hashy]');
      const skateboard = svg.querySelector<SVGGElement>(
        'g[hb-hashy-skates-skateboard]',
      );
      const shadow = svg.querySelector<SVGGElement>(
        'g[hb-hashy-skates-shadow] #shadow',
      );
      const shadowMask = svg.querySelector<SVGGElement>(
        'g[hb-hashy-skates-shadow] #shadow-mask',
      );

      if (
        !clouds ||
        !forest ||
        !hashy ||
        !skateboard ||
        !shadow ||
        !shadowMask
      ) {
        return;
      }

      const state: Record<
        'hashy' | 'board' | 'shadow' | 'forest' | 'clouds',
        LayerState
      > = {
        hashy: { x: 0, y: 0, targetX: 0, targetY: 0, max: 50 },
        board: { x: 0, y: 0, targetX: 0, targetY: 0, max: 50 },
        shadow: { x: 0, y: 0, targetX: 0, targetY: 0, max: 20 },
        forest: { x: 0, y: 0, targetX: 0, targetY: 0, max: 50 },
        clouds: { x: 0, y: 0, targetX: 0, targetY: 0, max: 100 },
      };

      let rafId: number | null = null;

      const mousemove$ = fromEvent<MouseEvent>(window, 'mousemove').pipe(
        tap((event) => {
          const rect = svg.getBoundingClientRect();
          const centerOfSvg = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
          const mouse = {
            x: event.clientX,
            y: event.clientY,
          };
          const xOffset = centerOfSvg.x - mouse.x;
          const yOffset = centerOfSvg.y - mouse.y;

          state.hashy.targetX = -softBound(xOffset, state.hashy.max);
          state.hashy.targetY = -softBound(yOffset, state.hashy.max);

          state.shadow.targetX = -softBound(xOffset, state.shadow.max);
          state.shadow.targetY = -softBound(yOffset, state.shadow.max);

          state.board.targetX = -softBound(xOffset, state.board.max);
          state.board.targetY = -softBound(yOffset, state.board.max);

          state.forest.targetX = softBound(xOffset, state.forest.max);
          state.forest.targetY = softBound(yOffset, state.forest.max);

          state.clouds.targetX = softBound(xOffset, state.clouds.max);
          state.clouds.targetY = softBound(yOffset, state.clouds.max);
        }),
      );

      const subscription = mousemove$.subscribe();

      const step = () => {
        animateLayer(state.hashy, this.stiffness, this.damping);
        animateLayer(state.shadow, this.stiffness, this.damping);
        animateLayer(state.board, this.stiffness, this.damping);
        animateLayer(state.forest, this.stiffness, this.damping);
        animateLayer(state.clouds, this.stiffness, this.damping);

        const shadowMaskX = state.forest.x - state.shadow.x;
        const shadowMaskY = state.forest.y - state.shadow.y;

        hashy.style.transform = `translate3d(${state.hashy.x}px, ${state.hashy.y}px, 0)`;
        shadow.style.transform = `translate3d(${state.shadow.x}px, ${state.shadow.y}px, 0)`;
        skateboard.style.transform = `translate3d(${state.board.x}px, ${state.board.y}px, 0)`;
        forest.style.transform = `translate3d(${state.forest.x}px, ${state.forest.y}px, 0)`;
        shadowMask.style.transform = `translate3d(${shadowMaskX}px, ${shadowMaskY}px, 0)`;
        clouds.style.transform = `translate3d(${state.clouds.x}px, ${state.clouds.y}px, 0)`;

        rafId = requestAnimationFrame(step);
      };

      rafId = requestAnimationFrame(step);

      teardown(() => {
        subscription.unsubscribe();
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
      });
    });
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

// Smoothly approaches max using a sigmoid-ish curve so small mouse moves still move a bit.
function softBound(value: number, max: number) {
  const k = 0.015; // lower = wider response before flattening
  const curved = Math.tanh(k * value) * max;
  return clamp(curved, -max, max);
}

function animateLayer(layer: LayerState, stiffness: number, damping: number) {
  const easedTargetX = easeEdge(layer.targetX / layer.max) * layer.max;
  const easedTargetY = easeEdge(layer.targetY / layer.max) * layer.max;

  layer.x += (easedTargetX - layer.x) * stiffness;
  layer.y += (easedTargetY - layer.y) * stiffness;

  layer.x *= 1 - damping;
  layer.y *= 1 - damping;
}

function easeEdge(normalized: number) {
  const sign = Math.sign(normalized);
  const v = Math.min(Math.abs(normalized), 1);
  // quadratic ease-out to soften at the boundary
  return sign * (1 - (1 - v) * (1 - v));
}

type LayerState = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  max: number;
};
