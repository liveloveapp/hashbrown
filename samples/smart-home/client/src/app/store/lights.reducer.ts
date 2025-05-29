import { createEntityAdapter, EntityAdapter, EntityState } from '@ngrx/entity';
import { createReducer, on } from '@ngrx/store';
import { Light } from '../models/light.model';
import { LightsApiActions } from '../features/lights/actions/lights-api.actions';
import { LightsPageActions } from '../features/lights/actions/lights-page.actions';
import { ChatAiActions } from '../features/chat/actions';
import { ScenesApiActions } from '../features/scenes/actions';

export interface LightsState extends EntityState<Light> {
  isLoading: boolean;
  error: string | null;
}

export const adapter: EntityAdapter<Light> = createEntityAdapter<Light>({
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

export const initialState: LightsState = adapter.getInitialState({
  isLoading: false,
  error: null,
});

export const lightsReducer = createReducer(
  initialState,
  on(LightsPageActions.enter, (state) => ({
    ...state,
    isLoading: true,
  })),
  on(LightsApiActions.loadLightsSuccess, (state, action) =>
    adapter.setAll(action.lights, { ...state, isLoading: false }),
  ),
  on(LightsApiActions.loadLightsFailure, (state, action) => ({
    ...state,
    isLoading: false,
    error: action.error,
  })),
  on(LightsApiActions.createLightSuccess, (state, action) =>
    adapter.addOne(action.light, state),
  ),
  on(LightsApiActions.createLightFailure, (state, action) => ({
    ...state,
    error: action.error,
  })),
  on(LightsApiActions.updateLightSuccess, (state, action) =>
    adapter.updateOne({ id: action.light.id, changes: action.light }, state),
  ),
  on(LightsApiActions.updateLightFailure, (state, action) => ({
    ...state,
    error: action.error,
  })),
  on(LightsApiActions.deleteLightSuccess, (state, action) =>
    adapter.removeOne(action.id, state),
  ),
  on(LightsApiActions.deleteLightFailure, (state, action) => ({
    ...state,
    error: action.error,
  })),
  on(
    ChatAiActions.applyScene,
    ScenesApiActions.applySceneSuccess,
    (state, action) =>
      adapter.updateMany(
        action.scene.lights.map((light) => ({
          id: light.lightId,
          changes: { brightness: light.brightness },
        })),
        state,
      ),
  ),
  on(ChatAiActions.addLight, (state, action) =>
    adapter.addOne(action.light, state),
  ),
  on(LightsApiActions.controlLightSuccess, (state, action) =>
    adapter.updateOne({ id: action.light.id, changes: action.light }, state),
  ),
  on(LightsApiActions.controlLightFailure, (state, action) => ({
    ...state,
    error: action.error,
  })),
);

export const { selectAll, selectEntities, selectIds, selectTotal } =
  adapter.getSelectors();
export const selectIsLoading = (state: LightsState) => state.isLoading;
export const selectError = (state: LightsState) => state.error;
