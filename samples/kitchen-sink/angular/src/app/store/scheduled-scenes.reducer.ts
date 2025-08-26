import { createEntityAdapter, EntityAdapter, EntityState } from '@ngrx/entity';
import { createReducer, on } from '@ngrx/store';
import { ScheduledScene } from '../models/scheduled-scene.model';
import {
  ScheduledScenesApiActions,
  ScheduledScenesPageActions,
} from '../pages/scheduled-scenes/actions';

export interface ScheduledScenesState extends EntityState<ScheduledScene> {
  loading: boolean;
  error: string | null;
}

export const adapter: EntityAdapter<ScheduledScene> =
  createEntityAdapter<ScheduledScene>();

export const initialState: ScheduledScenesState = adapter.getInitialState({
  loading: false,
  error: null,
});

export const scheduledScenesReducer = createReducer(
  initialState,
  on(ScheduledScenesPageActions.enter, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),
  on(
    ScheduledScenesApiActions.loadScheduledScenesSuccess,
    (state, { scheduledScenes }) =>
      adapter.setAll(scheduledScenes, { ...state, loading: false }),
  ),
  on(
    ScheduledScenesApiActions.loadScheduledScenesFailure,
    (state, { error }) => ({
      ...state,
      loading: false,
      error,
    }),
  ),
  on(
    ScheduledScenesApiActions.addScheduledSceneSuccess,
    (state, { scheduledScene }) => adapter.addOne(scheduledScene, state),
  ),
  on(
    ScheduledScenesApiActions.updateScheduledSceneSuccess,
    (state, { scheduledScene }) =>
      adapter.updateOne(
        { id: scheduledScene.id, changes: scheduledScene },
        state,
      ),
  ),
  on(ScheduledScenesApiActions.deleteScheduledSceneSuccess, (state, { id }) =>
    adapter.removeOne(id, state),
  ),
);

export const { selectAll, selectEntities, selectIds, selectTotal } =
  adapter.getSelectors();
export const selectLoading = (state: ScheduledScenesState) => state.loading;
export const selectError = (state: ScheduledScenesState) => state.error;
