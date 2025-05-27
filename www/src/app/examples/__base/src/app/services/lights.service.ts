import { isPlatformBrowser, isPlatformServer } from '@angular/common';
import { effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { Light } from '../models/light';

const DEFAULT_LIGHTS: Light[] = [
  {
    id: crypto.randomUUID(),
    name: 'Living Room - Couch Left',
    brightness: 50,
  },
  {
    id: crypto.randomUUID(),
    name: 'Living Room - Couch Right',
    brightness: 50,
  },
  {
    id: crypto.randomUUID(),
    name: 'Living Room - Ceiling Light',
    brightness: 75,
  },
  {
    id: crypto.randomUUID(),
    name: 'Bedroom - Left Bedside',
    brightness: 35,
  },
  {
    id: crypto.randomUUID(),
    name: 'Bedroom - Right Bedside',
    brightness: 35,
  },
];

@Injectable({ providedIn: 'root' })
export class LightsService {
  platformId = inject(PLATFORM_ID);

  private readonly lightsSignal = signal<Light[]>(DEFAULT_LIGHTS);

  readonly lights = this.lightsSignal.asReadonly();

  constructor() {
    this.saveToLocalStorage('lights', this.lightsSignal());
    effect(() => {
      if (isPlatformBrowser(this.platformId)) {
        this.saveToLocalStorage('lights', this.lightsSignal());
      }
    });
  }

  saveToLocalStorage<T>(key: string, data: T | null) {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(key, JSON.stringify(data));
    }
  }

  private loadFromLocalStorage<T>(key: string): T | null {
    if (isPlatformServer(this.platformId)) {
      return null;
    }
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  }

  addLight(light: Omit<Light, 'id'>) {
    const newLight: Light = {
      ...light,
      id: crypto.randomUUID(),
    };

    this.lightsSignal.update((lights) => [...lights, newLight]);

    return signal(newLight).asReadonly();
  }

  updateLight(id: string, updates: Partial<Omit<Light, 'id'>>) {
    const lightToUpdate = this.lights().find((light) => light.id == id);

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

    return signal(updatedLight).asReadonly();
  }

  deleteLight(id: string) {
    this.lightsSignal.update((lights) =>
      lights.filter((light) => light.id !== id),
    );
  }

  controlLight(lightId: string, brightness: number) {
    return this.updateLight(lightId, { brightness });
  }
}
