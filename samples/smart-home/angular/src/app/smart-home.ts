import { computed, effect, Injectable, Signal, signal } from '@angular/core';
import { Light, Scene, SceneLight } from './types';
import { mockLights, mockScenes } from './mock-data';

@Injectable({ providedIn: 'root' })
export class SmartHome {
  private readonly lightsSignal = signal<Light[]>(
    this.loadFromLocalStorage('lights') || mockLights,
  );
  private readonly scenesSignal = signal<Scene[]>(
    this.loadFromLocalStorage('scenes') || mockScenes,
  );

  readonly lights = computed(() => {
    return this.lightsSignal()
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  readonly scenes = computed(() => {
    return this.scenesSignal()
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  constructor() {
    effect(() => {
      this.saveToLocalStorage('lights', this.lightsSignal());
    });

    effect(() => {
      this.saveToLocalStorage('scenes', this.scenesSignal());
    });
  }

  private saveToLocalStorage(key: string, data: unknown) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  private loadFromLocalStorage<T>(key: string): T | null {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  }

  light(id: string | Signal<string>): Signal<Light> {
    return computed(() => {
      const lights = this.lights();
      const lightId = typeof id === 'string' ? id : id();
      const light = lights.find((light) => light.id === lightId);

      if (!light) throw new Error(`Could not find light with id ${lightId}`);

      return light;
    });
  }

  scene(id: string | Signal<string>): Signal<Scene> {
    return computed(() => {
      const scenes = this.scenes();
      const sceneId = typeof id === 'string' ? id : id();
      const scene = scenes.find((scene) => scene.id === sceneId);

      if (!scene) throw new Error(`Could not find scene with id ${sceneId}`);

      return scene;
    });
  }

  fetchLights() {
    return Promise.resolve(this.lights());
  }

  fetchScenes() {
    return Promise.resolve(this.scenes());
  }

  addLight(light: Omit<Light, 'id'>): Promise<Light> {
    const newLight: Light = {
      ...light,
      id: crypto.randomUUID(),
    };

    this.lightsSignal.update((lights) => [...lights, newLight]);

    return Promise.resolve(newLight);
  }

  updateLight(id: string, updates: Partial<Omit<Light, 'id'>>): Promise<Light> {
    const lightToUpdate = this.lights().find((light) => light.id === id);

    if (!lightToUpdate) {
      throw new Error('Light not found');
    }

    const updatedLight: Light = {
      ...lightToUpdate,
      ...updates,
    };

    this.lightsSignal.update((lights) =>
      lights.map((light) => (light.id === id ? updatedLight : light)),
    );

    return Promise.resolve(updatedLight);
  }

  deleteLight(id: string): Promise<string> {
    this.lightsSignal.update((lights) =>
      lights.filter((light) => light.id !== id),
    );

    return Promise.resolve(id);
  }

  addScene(scene: Omit<Scene, 'id'>): Promise<Scene> {
    const newScene: Scene = {
      ...scene,
      id: crypto.randomUUID(),
    };

    this.scenesSignal.update((scenes) => [...scenes, newScene]);

    return Promise.resolve(newScene);
  }

  updateScene(id: string, updates: Partial<Omit<Scene, 'id'>>): Promise<Scene> {
    const scene = this.scenes().find((s) => s.id === id);

    if (!scene) throw new Error('Scene not found');

    const updatedScene: Scene = {
      ...scene,
      ...updates,
    };

    this.scenesSignal.update((scenes) =>
      scenes.map((scene) => (scene.id === id ? updatedScene : scene)),
    );

    return Promise.resolve(scene);
  }

  deleteScene(id: string): Promise<string> {
    this.scenesSignal.update((scenes) =>
      scenes.filter((scene) => scene.id !== id),
    );

    return Promise.resolve(id);
  }

  applyScene(sceneId: string): Promise<Scene> {
    const scene = this.scenes().find((s) => s.id === sceneId);

    if (!scene) throw new Error('Scene not found');

    scene.lights.forEach((sceneLight) => {
      this.updateLight(sceneLight.lightId, {
        brightness: sceneLight.brightness,
      });
    });

    return Promise.resolve(scene);
  }

  addLightToScene(
    lightId: string,
    sceneId: string,
    brightness: number,
  ): Promise<SceneLight> {
    this.scenesSignal.update((scenes) =>
      scenes.map((scene) =>
        scene.id === sceneId
          ? { ...scene, lights: [...scene.lights, { lightId, brightness }] }
          : scene,
      ),
    );

    return Promise.resolve({ lightId, sceneId, brightness });
  }

  removeLightFromScene(
    lightId: string,
    sceneId: string,
  ): Promise<{ lightId: string; sceneId: string }> {
    this.scenesSignal.update((scenes) =>
      scenes.map((scene) =>
        scene.id === sceneId
          ? {
              ...scene,
              lights: scene.lights.filter((light) => light.lightId !== lightId),
            }
          : scene,
      ),
    );

    return Promise.resolve({ lightId, sceneId });
  }

  controlLight(lightId: string, brightness: number) {
    return this.updateLight(lightId, { brightness });
  }
}
