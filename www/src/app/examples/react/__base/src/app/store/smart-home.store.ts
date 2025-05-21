import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Light } from '../models/light.model';

interface SmartHomeState {
  lights: Light[];
  loadLights: (lights: Light[]) => void;
  createLight: (light: Light) => void;
  updateLight: (id: string, changes: Partial<Light>) => void;
}

export const useSmartHomeStore = create<SmartHomeState>()(
  persist(
    (set) => {
      return {
        lights: [
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
        ],
        loadLights: (lights) => set({ lights }),
        createLight: (light) =>
          set((state) => ({ lights: [...state.lights, light] })),
        updateLight: (id, changes) =>
          set((state) => ({
            lights: state.lights.map((l) =>
              l.id === id ? { ...l, ...changes } : l,
            ),
          })),
      };
    },
    {
      name: 'lights',
    },
  ),
);
