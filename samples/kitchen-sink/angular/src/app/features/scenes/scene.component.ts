/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Store } from '@ngrx/store';
import { selectScenesEntities } from '../../store';
import { ScenesPageActions } from './actions';

@Component({
  selector: 'app-scene',
  imports: [MatButtonModule],
  template: `
    <div class="scene-header">
      <h3>{{ scene().name }}</h3>
    </div>
    <div class="scene-content">
      <button matButton="outlined" color="primary" (click)="applyScene()">
        Apply
      </button>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: 1fr fit-content(100%);
      gap: 8px;
      width: 100%;
      border: 1px solid #ccc;
      border-radius: 48px;
      padding: 8px;
      margin: 8px 0;
    }

    .scene-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-left: 16px;
    }
  `,
})
export class SceneComponent {
  store = inject(Store);
  sceneEntities = this.store.selectSignal(selectScenesEntities);
  sceneId = input.required<string>();
  scene = computed(() => this.sceneEntities()[this.sceneId()]!);

  applyScene() {
    this.store.dispatch(ScenesPageActions.applyScene({ id: this.sceneId() }));
  }
}
