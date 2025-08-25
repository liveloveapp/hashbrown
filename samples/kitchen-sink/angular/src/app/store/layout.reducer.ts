import { createReducer, on } from '@ngrx/store';
import { ChatActions } from '../features/chat/actions';

export interface LayoutState {
  isChatPanelOpen: boolean;
}

export const initialState: LayoutState = {
  isChatPanelOpen: false,
};

export const layoutReducer = createReducer(
  initialState,
  on(ChatActions.toggleChatPanel, (state) => ({
    ...state,
    isChatPanelOpen: !state.isChatPanelOpen,
  })),
);

export const selectIsChatPanelOpen = (state: LayoutState) =>
  state.isChatPanelOpen;
