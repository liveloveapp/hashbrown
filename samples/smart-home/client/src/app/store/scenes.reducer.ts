import { createEntityAdapter, EntityAdapter, EntityState } from '@ngrx/entity';
import { createReducer, on } from '@ngrx/store';
import { Scene } from '../models/scene.model';
import { ScenesApiActions } from '../features/scenes/actions/scenes-api.actions';
import { ScenesPageActions } from '../features/scenes/actions/scenes-page.actions';
import { ChatAiActions } from '../features/chat/actions/chat-ai.actions';
import { DashboardApiActions } from '../features/dashboard/actions';

export interface ScenesState extends EntityState<Scene> {
  loading: boolean;
  error: string | null;
}

export const adapter: EntityAdapter<Scene> = createEntityAdapter<Scene>({
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

export const initialState: ScenesState = adapter.getInitialState({
  loading: false,
  error: null,
});

export const scenesReducer = createReducer(
  initialState,
  on(ScenesPageActions.enter, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),
  on(
    ScenesApiActions.loadScenesSuccess,
    DashboardApiActions.loadHomeStateSuccess,
    (state, { scenes }) => adapter.setAll(scenes, { ...state, loading: false }),
  ),
  on(ScenesApiActions.loadScenesFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  on(ScenesApiActions.addSceneSuccess, (state, { scene }) =>
    adapter.addOne(scene, state),
  ),
  on(ScenesApiActions.updateSceneSuccess, (state, { scene }) =>
    adapter.updateOne({ id: scene.id, changes: scene }, state),
  ),
  on(ScenesApiActions.deleteSceneSuccess, (state, { id }) =>
    adapter.removeOne(id, state),
  ),
  on(
    ScenesApiActions.addLightToSceneSuccess,
    (state, { sceneLight, sceneId }) => {
      const scene = state.entities[sceneId];
      if (!scene) return state;

      return adapter.updateOne(
        {
          id: sceneId,
          changes: {
            lights: [...scene.lights, sceneLight],
          },
        },
        state,
      );
    },
  ),
  on(ChatAiActions.addScene, (state, { scene }) =>
    adapter.addOne(scene, state),
  ),
);

export const { selectAll, selectEntities, selectIds, selectTotal } =
  adapter.getSelectors();
export const selectLoading = (state: ScenesState) => state.loading;
export const selectError = (state: ScenesState) => state.error;
