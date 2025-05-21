import { inject } from '@angular/core';
import {
  patchState,
  signalStore,
  watchState,
  withHooks,
  withMethods,
} from '@ngrx/signals';
import {
  addEntity,
  setEntities,
  updateEntity,
  withEntities,
} from '@ngrx/signals/entities';
import { Light } from '../models/light';
import { LightsService } from '../services/lights.service';

export const LightsStore = signalStore(
  withEntities<Light>(),
  withMethods((store) => ({
    createLight(light: Light): void {
      patchState(store, addEntity(light));
    },
    loadLights(lights: Light[]): void {
      patchState(store, setEntities(lights));
    },
    updateLight(id: string, changes: Partial<Light>): void {
      patchState(store, updateEntity({ id, changes }));
    },
  })),
  withHooks({
    onInit(store) {
      const lightsService = inject(LightsService);
      const lights = lightsService.lights();
      patchState(store, setEntities(lights));

      watchState(store, (state) => {
        const lights = state.ids.map((id) => state.entityMap[id]);
        lightsService.saveToLocalStorage('lights', lights);
      });
    },
  }),
);
