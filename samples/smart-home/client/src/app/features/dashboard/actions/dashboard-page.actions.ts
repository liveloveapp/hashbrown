import { createActionGroup, emptyProps } from '@ngrx/store';

export const DashboardPageActions = createActionGroup({
  source: 'Dashboard Page',
  events: {
    Enter: emptyProps(),
  },
});
