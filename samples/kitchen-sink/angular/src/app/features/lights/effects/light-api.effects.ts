import { inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, concatMap, map, of } from 'rxjs';
import { SmartHomeService } from '../../../services/smart-home.service';
import { PredictionsAiActions } from '../../predictions/actions';
import { ScenesPageActions } from '../../scenes/actions';
import { ChatAiActions } from '../../chat/actions';
import { LightsApiActions, LightsPageActions } from '../actions';

export const loadLights$ = createEffect(
  () => {
    const actions$ = inject(Actions);
    const smartHome = inject(SmartHomeService);

    return actions$.pipe(
      ofType(LightsPageActions.enter, ScenesPageActions.enter),
      concatMap(() => {
        return smartHome.loadLights$().pipe(
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
          .addLight$({
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
        return smartHome.updateLight$(action.id, action.changes).pipe(
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
        return smartHome.deleteLight$(action.id).pipe(
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

export const controlLight$ = createEffect(
  () => {
    const actions$ = inject(Actions);
    const smartHome = inject(SmartHomeService);

    return actions$.pipe(
      ofType(ChatAiActions.controlLight),
      concatMap((action) => {
        return smartHome.controlLight$(action.lightId, action.brightness).pipe(
          map((light) => LightsApiActions.controlLightSuccess({ light })),
          catchError((error) =>
            of(LightsApiActions.controlLightFailure({ error })),
          ),
        );
      }),
    );
  },
  { functional: true },
);
