import { isPlatformBrowser, isPlatformServer } from '@angular/common';
import { effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { Light } from '../models/light.model';

@Injectable({ providedIn: 'root' })
export class LightsService {
  platformId = inject(PLATFORM_ID);

  private readonly lightsSignal = signal<Light[]>(
    this.loadFromLocalStorage('lights') ?? [
      {
        id: '1',
        name: 'Living Room',
        brightness: 50,
      },
      {
        id: '2',
        name: 'Bedroom',
        brightness: 75,
      },
      {
        id: '3',
        name: 'Kitchen',
        brightness: 100,
      },
    ],
  );

  readonly lights = this.lightsSignal.asReadonly();

  constructor() {
    this.saveToLocalStorage('lights', this.lightsSignal());
    effect(() => {
      if (isPlatformBrowser(this.platformId)) {
        this.saveToLocalStorage('lights', this.lightsSignal());
      }
    });
  }

  private saveToLocalStorage(key: string, data: unknown) {
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
