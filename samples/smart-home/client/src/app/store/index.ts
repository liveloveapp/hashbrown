import { ActionReducerMap, createSelector } from '@ngrx/store';
import * as fromLastUserAction from './last-user-action.reducer';
import * as fromLayout from './layout.reducer';
import * as fromLights from './lights.reducer';
import * as fromScenes from './scenes.reducer';
import * as fromScheduledScenes from './scheduled-scenes.reducer';

export interface AppState {
  lights: fromLights.LightsState;
  lastUserAction: fromLastUserAction.LastUserActionState;
  scenes: fromScenes.ScenesState;
  scheduledScenes: fromScheduledScenes.ScheduledScenesState;
  layout: fromLayout.LayoutState;
}

export const reducers: ActionReducerMap<AppState> = {
  lights: fromLights.lightsReducer,
  lastUserAction: fromLastUserAction.lastUserActionReducer,
  scenes: fromScenes.scenesReducer,
  scheduledScenes: fromScheduledScenes.scheduledScenesReducer,
  layout: fromLayout.layoutReducer,
};

export const selectLightsState = (state: AppState) => state.lights;
export const selectAllLights = createSelector(
  selectLightsState,
  fromLights.selectAll,
);
export const selectLightEntities = createSelector(
  selectLightsState,
  fromLights.selectEntities,
);
export const selectIsLightsLoading = createSelector(
  selectLightsState,
  fromLights.selectIsLoading,
);
export const selectLightsError = createSelector(
  selectLightsState,
  fromLights.selectError,
);
export const selectLightNames = createSelector(
  selectLightsState,
  fromLights.selectLightNames,
);

export const selectLastUserActionState = (state: AppState) =>
  state.lastUserAction;
export const selectLastUserAction = createSelector(
  selectLastUserActionState,
  fromLastUserAction.selectLastUserAction,
);

export const selectScenesState = (state: AppState) => state.scenes;
export const selectAllScenes = createSelector(
  selectScenesState,
  fromScenes.selectAll,
);
export const selectScenesEntities = createSelector(
  selectScenesState,
  fromScenes.selectEntities,
);
export const selectScenesLoading = createSelector(
  selectScenesState,
  fromScenes.selectLoading,
);
export const selectScenesError = createSelector(
  selectScenesState,
  fromScenes.selectError,
);

export const selectLayoutState = (state: AppState) => state.layout;
export const selectIsChatPanelOpen = createSelector(
  selectLayoutState,
  fromLayout.selectIsChatPanelOpen,
);
