import { createReducer, on } from '@ngrx/store';
import { LightsApiActions } from '../features/lights/actions/lights-api.actions';
import { ScenesApiActions } from '../features/scenes/actions/scenes-api.actions';
export interface LastUserActionState {
  action: {
    userAction: string;
    payload: object;
  } | null;
}

export const initialState: LastUserActionState = {
  action: null,
};

export const lastUserActionReducer = createReducer(
  initialState,
  on(LightsApiActions.createLightSuccess, (state, action) => ({
    ...state,
    action: {
      userAction: 'Add Light Success',
      payload: action.light,
    },
  })),
  on(ScenesApiActions.addSceneSuccess, (state, action) => ({
    ...state,
    action: {
      userAction: 'Add Scene Success',
      payload: action.scene,
    },
  }))
);

export const selectLastUserAction = (state: LastUserActionState) =>
  state.action;
