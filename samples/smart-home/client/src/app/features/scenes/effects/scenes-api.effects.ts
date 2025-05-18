import { inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { SmartHomeService } from '../../../services/smart-home.service';
import { LightsPageActions } from '../../lights/actions';
import { PredictionsAiActions } from '../../predictions/actions';
import { ScenesApiActions, ScenesPageActions } from '../actions';
import { ScheduledScenesPageActions } from '../../../pages/scheduled-scenes/actions';

export const loadScenes$ = createEffect(
  () => {
    const actions$ = inject(Actions);
    const smartHome = inject(SmartHomeService);

    return actions$.pipe(
      ofType(
        ScenesPageActions.enter,
        LightsPageActions.enter,
        ScheduledScenesPageActions.enter,
      ),
      mergeMap(() =>
        of(smartHome.scenes()).pipe(
          map((scenes) => ScenesApiActions.loadScenesSuccess({ scenes })),
          catchError((error) =>
            of(ScenesApiActions.loadScenesFailure({ error: error.message })),
          ),
        ),
      ),
    );
  },
  { functional: true },
);

export const addScene$ = createEffect(
  () => {
    const actions$ = inject(Actions);
    const smartHome = inject(SmartHomeService);

    return actions$.pipe(
      ofType(ScenesPageActions.addScene),
      mergeMap(({ scene }) => {
        smartHome.addScene(scene);
        const newScene = smartHome.scenes().find((s) => s.name === scene.name);
        if (!newScene) {
          return of(
            ScenesApiActions.addSceneFailure({
              error: 'Failed to create scene',
            }),
          );
        }
        return of(newScene).pipe(
          map((scene) => ScenesApiActions.addSceneSuccess({ scene })),
          catchError((error) =>
            of(ScenesApiActions.addSceneFailure({ error: error.message })),
          ),
        );
      }),
    );
  },
  { functional: true },
);

export const addLightToScene$ = createEffect(
  () => {
    const actions$ = inject(Actions);
    const smartHome = inject(SmartHomeService);

    return actions$.pipe(
      ofType(PredictionsAiActions.addLightToScene),
      mergeMap(({ lightId, sceneId, brightness }) => {
        return smartHome.addLightToScene(lightId, sceneId, brightness).pipe(
          map((sceneLight) =>
            ScenesApiActions.addLightToSceneSuccess({
              sceneLight,
              sceneId,
            }),
          ),
          catchError((error) =>
            of(
              ScenesApiActions.addLightToSceneFailure({ error: error.message }),
            ),
          ),
        );
      }),
    );
  },
  { functional: true },
);

export const updateScene$ = createEffect(
  () => {
    const actions$ = inject(Actions);
    const smartHome = inject(SmartHomeService);

    return actions$.pipe(
      ofType(ScenesPageActions.updateScene),
      mergeMap(({ id, scene }) => {
        return smartHome.updateScene(id, scene).pipe(
          map((updatedScene) =>
            ScenesApiActions.updateSceneSuccess({ scene: updatedScene }),
          ),
          catchError((error) =>
            of(ScenesApiActions.updateSceneFailure({ error: error.message })),
          ),
        );
      }),
    );
  },
  { functional: true },
);

export const deleteScene$ = createEffect(
  () => {
    const actions$ = inject(Actions);
    const smartHome = inject(SmartHomeService);

    return actions$.pipe(
      ofType(ScenesPageActions.deleteScene),
      mergeMap(({ id }) => {
        return smartHome.deleteScene(id).pipe(
          map((id) => ScenesApiActions.deleteSceneSuccess({ id })),
          catchError((error) =>
            of(ScenesApiActions.deleteSceneFailure({ error: error.message })),
          ),
        );
      }),
    );
  },
  { functional: true },
);

export const applyScene$ = createEffect(
  () => {
    const actions$ = inject(Actions);
    const smartHome = inject(SmartHomeService);

    return actions$.pipe(
      ofType(ScenesPageActions.applyScene),
      mergeMap(({ id }) => {
        return smartHome.applyScene(id).pipe(
          map((scene) => ScenesApiActions.applySceneSuccess({ scene })),
          catchError((error) =>
            of(ScenesApiActions.applySceneFailure({ error: error.message })),
          ),
        );
      }),
    );
  },
  { functional: true },
);
