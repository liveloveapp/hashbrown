import { inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { SmartHomeService } from '../../../services/smart-home.service';
import {
  ScheduledScenesApiActions,
  ScheduledScenesPageActions,
} from '../actions';

export const loadScheduledScenes$ = createEffect(
  () => {
    const actions$ = inject(Actions);
    const smartHome = inject(SmartHomeService);

    return actions$.pipe(
      ofType(ScheduledScenesPageActions.enter),
      mergeMap(() =>
        of(smartHome.scheduledScenes()).pipe(
          map((scheduledScenes) =>
            ScheduledScenesApiActions.loadScheduledScenesSuccess({
              scheduledScenes,
            }),
          ),
          catchError((error) =>
            of(
              ScheduledScenesApiActions.loadScheduledScenesFailure({
                error: error.message,
              }),
            ),
          ),
        ),
      ),
    );
  },
  { functional: true },
);

export const addScheduledScene$ = createEffect(
  () => {
    const actions$ = inject(Actions);
    const smartHome = inject(SmartHomeService);

    return actions$.pipe(
      ofType(ScheduledScenesPageActions.addScheduledScene),
      mergeMap(({ scheduledScene }) => {
        smartHome.addScheduledScene$(scheduledScene);
        const newScheduledScene = smartHome
          .scheduledScenes()
          .find((s) => s.name === scheduledScene.name);
        if (!newScheduledScene) {
          return of(
            ScheduledScenesApiActions.addScheduledSceneFailure({
              error: 'Failed to create scene',
            }),
          );
        }
        return of(newScheduledScene).pipe(
          map((scheduledScene) =>
            ScheduledScenesApiActions.addScheduledSceneSuccess({
              scheduledScene,
            }),
          ),
          catchError((error) =>
            of(
              ScheduledScenesApiActions.addScheduledSceneFailure({
                error: error.message,
              }),
            ),
          ),
        );
      }),
    );
  },
  { functional: true },
);

export const updateScheduledScene$ = createEffect(
  () => {
    const actions$ = inject(Actions);
    const smartHome = inject(SmartHomeService);

    return actions$.pipe(
      ofType(ScheduledScenesPageActions.updateScheduledScene),
      mergeMap(({ id, scheduledScene }) => {
        return smartHome.updateScheduledScene$(id, scheduledScene).pipe(
          map((updatedScheduledScene) =>
            ScheduledScenesApiActions.updateScheduledSceneSuccess({
              scheduledScene: updatedScheduledScene,
            }),
          ),
          catchError((error) =>
            of(
              ScheduledScenesApiActions.updateScheduledSceneFailure({
                error: error.message,
              }),
            ),
          ),
        );
      }),
    );
  },
  { functional: true },
);

export const deleteScheduledScene$ = createEffect(
  () => {
    const actions$ = inject(Actions);
    const smartHome = inject(SmartHomeService);

    return actions$.pipe(
      ofType(ScheduledScenesPageActions.deleteScheduledScene),
      mergeMap(({ id }) => {
        return smartHome.deleteScheduledScene$(id).pipe(
          map((id) =>
            ScheduledScenesApiActions.deleteScheduledSceneSuccess({ id }),
          ),
          catchError((error) =>
            of(
              ScheduledScenesApiActions.deleteScheduledSceneFailure({
                error: error.message,
              }),
            ),
          ),
        );
      }),
    );
  },
  { functional: true },
);
