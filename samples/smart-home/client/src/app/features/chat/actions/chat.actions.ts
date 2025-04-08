import { createActionGroup, emptyProps } from '@ngrx/store';

export const ChatActions = createActionGroup({
  source: 'Chat',
  events: {
    'Open Chat Panel': emptyProps(),
    'Close Chat Panel': emptyProps(),
  },
});
