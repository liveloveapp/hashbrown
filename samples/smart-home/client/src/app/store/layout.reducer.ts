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
  on(ChatActions.openChatPanel, (state) => ({
    ...state,
    isChatPanelOpen: true,
  })),
  on(ChatActions.closeChatPanel, (state) => ({
    ...state,
    isChatPanelOpen: false,
  })),
);

export const selectIsChatPanelOpen = (state: LayoutState) =>
  state.isChatPanelOpen;
