import { inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concatMap, map, catchError, of } from 'rxjs';
import { SmartHomeService } from '../../../services/smart-home.service';
import { LightsPageActions, LightsApiActions } from '../actions';
import { PredictionsAiActions } from '../../predictions/actions';
import { ScenesPageActions } from '../../scenes/actions';
export const loadLights$ = createEffect(
  () => {
    const actions$ = inject(Actions);
    const smartHome = inject(SmartHomeService);

    return actions$.pipe(
      ofType(LightsPageActions.enter, ScenesPageActions.enter),
      concatMap(() => {
        return smartHome.loadLights().pipe(
          map((lights) => LightsApiActions.loadLightsSuccess({ lights })),
          catchError((error) =>
            of(LightsApiActions.loadLightsFailure({ error })),
          ),
        );
      }),
    );
  },
  { functional: true },
);

export const createLight$ = createEffect(
  () => {
    const actions$ = inject(Actions);
    const smartHome = inject(SmartHomeService);

    return actions$.pipe(
      ofType(LightsPageActions.addLight, PredictionsAiActions.addLight),
      concatMap((action) => {
        return smartHome
          .addLight({
            ...action.light,
            brightness: 100,
          })
          .pipe(
            map((light) => LightsApiActions.createLightSuccess({ light })),
            catchError((error) =>
              of(LightsApiActions.createLightFailure({ error })),
            ),
          );
      }),
    );
  },
  { functional: true },
);

export const updateLight$ = createEffect(
  () => {
    const actions$ = inject(Actions);
    const smartHome = inject(SmartHomeService);

    return actions$.pipe(
      ofType(LightsPageActions.updateLight),
      concatMap((action) => {
        return smartHome.updateLight(action.id, action.changes).pipe(
          map((light) => LightsApiActions.updateLightSuccess({ light })),
          catchError((error) =>
            of(LightsApiActions.updateLightFailure({ error })),
          ),
        );
      }),
    );
  },
  { functional: true },
);

export const deleteLight$ = createEffect(
  () => {
    const actions$ = inject(Actions);
    const smartHome = inject(SmartHomeService);

    return actions$.pipe(
      ofType(LightsPageActions.deleteLight),
      concatMap((action) => {
        return smartHome.deleteLight(action.id).pipe(
          map(() => LightsApiActions.deleteLightSuccess({ id: action.id })),
          catchError((error) =>
            of(LightsApiActions.deleteLightFailure({ error })),
          ),
        );
      }),
    );
  },
  { functional: true },
);
