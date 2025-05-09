import { effect, Injectable, signal } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { Light } from '../models/light.model';
import { Scene, SceneLight } from '../models/scene.model';
import { ScheduledScene, Weekday } from '../models/scheduled-scene.model';

@Injectable({
  providedIn: 'root',
})
export class SmartHomeService {
  private readonly lightsSignal = signal<Light[]>(
    this.loadFromLocalStorage('lights') || [],
  );
  private readonly scenesSignal = signal<Scene[]>(
    this.loadFromLocalStorage('scenes') || [],
  );
  private readonly scheduledScenesSignal = signal<ScheduledScene[]>(
    this.loadFromLocalStorage('scheduledScenes') || [],
  );

  readonly lights = this.lightsSignal.asReadonly();
  readonly scenes = this.scenesSignal.asReadonly();
  readonly scheduledScenes = this.scheduledScenesSignal.asReadonly();

  constructor() {
    effect(() => {
      this.saveToLocalStorage('lights', this.lightsSignal());
    });

    effect(() => {
      this.saveToLocalStorage('scenes', this.scenesSignal());
    });

    effect(() => {
      this.saveToLocalStorage('scheduledScenes', this.scheduledScenesSignal());
    });

    // Start checking for scheduled scenes
    this.startScheduledScenesCheck();
  }

  private saveToLocalStorage(key: string, data: unknown) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  private loadFromLocalStorage<T>(key: string): T | null {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  }

  loadLights(): Observable<Light[]> {
    return of(this.lights());
  }

  loadScenes(): Observable<Scene[]> {
    return of(this.scenes());
  }

  addLight(light: Omit<Light, 'id'>): Observable<Light> {
    const newLight: Light = {
      ...light,
      id: crypto.randomUUID(),
    };

    this.lightsSignal.update((lights) => [...lights, newLight]);

    return of(newLight);
  }

  updateLight(id: string, updates: Partial<Omit<Light, 'id'>>) {
    const lightToUpdate = this.lights().find((light) => light.id === id);

    if (!lightToUpdate) {
      return throwError(() => new Error('Light not found'));
    }

    const updatedLight: Light = {
      ...lightToUpdate,
      ...updates,
    };

    this.lightsSignal.update((lights) =>
      lights.map((light) => (light.id === id ? updatedLight : light)),
    );

    return of(updatedLight);
  }

  deleteLight(id: string): Observable<string> {
    this.lightsSignal.update((lights) =>
      lights.filter((light) => light.id !== id),
    );

    return of(id);
  }

  addScene(scene: Omit<Scene, 'id'>): Observable<Scene> {
    const newScene: Scene = {
      ...scene,
      id: crypto.randomUUID(),
    };

    this.scenesSignal.update((scenes) => [...scenes, newScene]);

    return of(newScene);
  }

  updateScene(
    id: string,
    updates: Partial<Omit<Scene, 'id'>>,
  ): Observable<Scene> {
    const scene = this.scenes().find((s) => s.id === id);

    if (!scene) return throwError(() => new Error('Scene not found'));

    const updatedScene: Scene = {
      ...scene,
      ...updates,
    };

    this.scenesSignal.update((scenes) =>
      scenes.map((scene) => (scene.id === id ? updatedScene : scene)),
    );

    return of(scene);
  }

  deleteScene(id: string): Observable<string> {
    this.scenesSignal.update((scenes) =>
      scenes.filter((scene) => scene.id !== id),
    );

    return of(id);
  }

  applyScene(sceneId: string): Observable<Scene> {
    const scene = this.scenes().find((s) => s.id === sceneId);

    if (!scene) return throwError(() => new Error('Scene not found'));

    scene.lights.forEach((sceneLight) => {
      this.updateLight(sceneLight.lightId, {
        brightness: sceneLight.brightness,
      });
    });

    return of(scene);
  }

  addScheduledScene(
    scheduledScene: Omit<ScheduledScene, 'id'>,
  ): Observable<ScheduledScene> {
    const newScheduledScene: ScheduledScene = {
      ...scheduledScene,
      id: crypto.randomUUID(),
    };

    this.scheduledScenesSignal.update((scheduledScenes) => [
      ...scheduledScenes,
      newScheduledScene,
    ]);

    return of(newScheduledScene);
  }

  updateScheduledScene(
    id: string,
    updates: Partial<Omit<ScheduledScene, 'id'>>,
  ): Observable<ScheduledScene> {
    const scheduledScene = this.scheduledScenes().find(
      (scheduledScene) => scheduledScene.id === id,
    );

    if (!scheduledScene) {
      return throwError(() => new Error('Scheduled scene not found'));
    }

    const updatedScheduledScene: ScheduledScene = {
      ...scheduledScene,
      ...updates,
    };

    this.scheduledScenesSignal.update((scheduledScenes) =>
      scheduledScenes.map((scheduledScene) =>
        scheduledScene.id === id ? updatedScheduledScene : scheduledScene,
      ),
    );

    return of(updatedScheduledScene);
  }

  deleteScheduledScene(id: string): Observable<string> {
    this.scheduledScenesSignal.update((scheduledScenes) =>
      scheduledScenes.filter((scheduledScene) => scheduledScene.id !== id),
    );

    return of(id);
  }

  addLightToScene(
    lightId: string,
    sceneId: string,
    brightness: number,
  ): Observable<SceneLight> {
    this.scenesSignal.update((scenes) =>
      scenes.map((scene) =>
        scene.id === sceneId
          ? { ...scene, lights: [...scene.lights, { lightId, brightness }] }
          : scene,
      ),
    );

    return of({ lightId, sceneId, brightness });
  }

  controlLight(lightId: string, brightness: number) {
    return this.updateLight(lightId, { brightness });
  }

  private startScheduledScenesCheck() {
    // Check every minute for scheduled scenes
    setInterval(() => {
      this.checkScheduledScenes();
    }, 60000);
  }

  private checkScheduledScenes() {
    const now = new Date();
    const currentWeekday = now.getDay();
    const weekdays = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];
    const currentWeekdayName = weekdays[currentWeekday] as Weekday;

    this.scheduledScenes().forEach((scheduledScene) => {
      if (!scheduledScene.isEnabled) return;

      const startDate = new Date(scheduledScene.startDate);
      const shouldTrigger =
        // Check if it's the start date
        (startDate.getDate() === now.getDate() &&
          startDate.getMonth() === now.getMonth() &&
          startDate.getFullYear() === now.getFullYear()) ||
        // Or if it matches the recurrence rule
        scheduledScene.recurrenceRule?.weekdays.includes(currentWeekdayName);

      if (shouldTrigger) {
        this.applyScene(scheduledScene.sceneId);
      }
    });
  }
}
