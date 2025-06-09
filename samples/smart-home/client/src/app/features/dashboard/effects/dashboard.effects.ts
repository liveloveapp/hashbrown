import { createEffect } from '@ngrx/effects';
import { Actions, ofType } from '@ngrx/effects';
import { SmartHomeService } from '../../../services/smart-home.service';
import { inject } from '@angular/core';
import { catchError, concatMap, forkJoin, map, of } from 'rxjs';
import { DashboardApiActions, DashboardPageActions } from '../actions';

export const loadState$ = createEffect(
  () => {
    const actions$ = inject(Actions);
    const smartHome = inject(SmartHomeService);

    return actions$.pipe(
      ofType(DashboardPageActions.enter),
      concatMap(() => {
        return forkJoin([
          smartHome.loadLights$(),
          smartHome.loadScenes$(),
        ]).pipe(
          map(([lights, scenes]) =>
            DashboardApiActions.loadHomeStateSuccess({ lights, scenes }),
          ),
          catchError((error) =>
            of(DashboardApiActions.loadHomeStateFailure({ error })),
          ),
        );
      }),
    );
  },
  { functional: true },
);
