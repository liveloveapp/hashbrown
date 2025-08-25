/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Component, computed, inject, input } from '@angular/core';
import { Store } from '@ngrx/store';
import { selectScenesEntities } from '../../../store';
import { ScenesPageActions } from '../../scenes/actions/scenes-page.actions';
import {
  animate,
  keyframes,
  style,
  transition,
  trigger,
} from '@angular/animations';

@Component({
  selector: 'app-scene-card-button',
  imports: [],
  template: `
    <button
      type="button"
      (click)="onSceneChange()"
      [@bounce]="animateState"
      (@bounce.done)="resetAnimation()"
    >
      <span>{{ shortenedName() }}</span>
    </button>
  `,
  styles: `
    button {
      display: flex;
      flex-direction: column-reverse;
      width: 160px;
      height: 48px;
      padding: 16px;
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
export class SceneCardButtonComponent {
  sceneId = input.required<string>();
  shortenedName = input.required<string>();
  store = inject(Store);
  scenesEntities = this.store.selectSignal(selectScenesEntities);
  scene = computed(() => this.scenesEntities()[this.sceneId()]!);

  animateState: 'default' | 'active' = 'default';

  resetAnimation() {
    this.animateState = 'default';
  }

  onSceneChange() {
    this.animateState = 'active';
    this.store.dispatch(ScenesPageActions.applyScene({ id: this.sceneId() }));
  }
}
