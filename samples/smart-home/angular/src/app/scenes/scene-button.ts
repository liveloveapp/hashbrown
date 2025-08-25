import { Component, inject, input, signal } from '@angular/core';
import {
  animate,
  keyframes,
  style,
  transition,
  trigger,
} from '@angular/animations';
import { SmartHome } from '../smart-home';

@Component({
  selector: 'app-scene-button',
  imports: [],
  template: `
    <button
      type="button"
      (click)="onSceneChange()"
      [@bounce]="animateState()"
      (@bounce.done)="resetAnimation()"
    >
      <span>{{ scene().name }}</span>
    </button>
  `,
  styles: `
    button {
      display: inline-flex;
      flex-direction: column-reverse;
      width: 160px;
      height: 48px;
      padding: 16px;
      margin: 4px 6px;
      cursor: pointer;
      background-image: linear-gradient(
        to right,
        rgba(31, 162, 255, 0.18) 0%,
        rgba(18, 216, 250, 0.18) 51%,
        rgba(31, 162, 255, 0.18) 100%
      );
      transition: 0.5s;
      background-size: 200% auto;
      border: none;
      border-radius: 16px;

      &:hover {
        background-position: right center;
      }
    }

    button span {
      align-self: flex-start;
      justify-self: flex-start;
      text-align: left;
    }
  `,
  animations: [
    trigger('bounce', [
      transition('default => active', [
        animate(
          '300ms ease-out',
          keyframes([
            style({ transform: 'scale(1)', offset: 0 }),
            style({ transform: 'scale(0.8)', offset: 0.5 }),
            style({ transform: 'scale(1)', offset: 1.0 }),
          ]),
        ),
      ]),
    ]),
  ],
})
export class SceneButton {
  readonly smartHome = inject(SmartHome);
  readonly sceneId = input.required<string>();
  protected scene = this.smartHome.scene(this.sceneId);

  animateState = signal<'default' | 'active'>('default');

  resetAnimation() {
    this.animateState.set('default');
  }

  onSceneChange() {
    this.animateState.set('active');
    this.smartHome.applyScene(this.sceneId());
  }
}
