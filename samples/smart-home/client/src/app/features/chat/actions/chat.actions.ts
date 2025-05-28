import { createActionGroup, emptyProps } from '@ngrx/store';

export const ChatActions = createActionGroup({
  source: 'Chat',
  events: {
    'Toggle Chat Panel': emptyProps(),
  },
});
