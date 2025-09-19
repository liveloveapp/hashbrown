import {
  animate,
  keyframes,
  style,
  transition,
  trigger,
} from '@angular/animations';
import { Component, inject, input, signal } from '@angular/core';
import { SmartHome } from '../smart-home';
import { Squircle } from '../squircle';

@Component({
  selector: 'app-scene-button',
  imports: [Squircle],
  template: `
    <button
      type="button"
      (click)="onSceneChange()"
      [@bounce]="animateState()"
      (@bounce.done)="resetAnimation()"
      appSquircle="16"
      [appSquircleBorderWidth]="2"
      appSquircleBorderColor="var(--sky-blue, #9ecfd7)"
    >
      <span>{{ scene().name }}</span>
    </button>
  `,
  styles: `
    button {
      display: inline-flex;
      flex-direction: column-reverse;
      align-items: flex-start;
      justify-content: center;
      height: 48px;
      padding: 16px;
      background: var(--sky-blue-light, #d8ecef);
      transition: 0.5s;

      &:hover {
        background-position: right center;
      }
    }

    button span {
      max-height: 48px;
      overflow-x: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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
