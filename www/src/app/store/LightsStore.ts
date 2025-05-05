import { patchState, signalStore, withMethods } from '@ngrx/signals';
import {
  addEntity,
  setEntities,
  updateEntity,
  withEntities,
} from '@ngrx/signals/entities';
import { Light } from '../models/light.model';

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
);
