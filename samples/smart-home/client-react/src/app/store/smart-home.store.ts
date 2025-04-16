import { create } from 'zustand';
import { Light } from '../models/light.model';
import { Scene } from '../models/scene.model';
import { ScheduledScene } from '../models/scheduled-scene.model';

// Define the store state interface
interface SmartHomeState {
  // Data
  lights: Light[];
  scenes: Scene[];
  scheduledScenes: ScheduledScene[];

  // Actions for Lights
  addLight: (light: Light) => void;
  updateLight: (id: string, light: Partial<Light>) => void;
  deleteLight: (id: string) => void;

  // Actions for Scenes
  addScene: (scene: Scene) => void;
  updateScene: (id: string, scene: Partial<Scene>) => void;
  deleteScene: (id: string) => void;

  // Actions for Scheduled Scenes
  addScheduledScene: (scheduledScene: ScheduledScene) => void;
  updateScheduledScene: (
    id: string,
    scheduledScene: Partial<ScheduledScene>,
  ) => void;
  deleteScheduledScene: (id: string) => void;
  toggleScheduledScene: (id: string) => void;
}

// Create the store
export const useSmartHomeStore = create<SmartHomeState>((set) => ({
  // Initial state
  lights: [],
  scenes: [],
  scheduledScenes: [],

  // Light actions
  addLight: (light) => set((state) => ({ lights: [...state.lights, light] })),

  updateLight: (id, updatedLight) =>
    set((state) => ({
      lights: state.lights.map((light) =>
        light.id === id ? { ...light, ...updatedLight } : light,
      ),
    })),

  deleteLight: (id) =>
    set((state) => ({
      lights: state.lights.filter((light) => light.id !== id),
      // Also remove this light from any scenes
      scenes: state.scenes.map((scene) => ({
        ...scene,
        lights: scene.lights.filter((sceneLight) => sceneLight.lightId !== id),
      })),
    })),

  // Scene actions
  addScene: (scene) => set((state) => ({ scenes: [...state.scenes, scene] })),

  updateScene: (id, updatedScene) =>
    set((state) => ({
      scenes: state.scenes.map((scene) =>
        scene.id === id ? { ...scene, ...updatedScene } : scene,
      ),
    })),

  deleteScene: (id) =>
    set((state) => ({
      scenes: state.scenes.filter((scene) => scene.id !== id),
      // Also remove any scheduled scenes that reference this scene
      scheduledScenes: state.scheduledScenes.filter(
        (scheduledScene) => scheduledScene.sceneId !== id,
      ),
    })),

  // Scheduled Scene actions
  addScheduledScene: (scheduledScene) =>
    set((state) => ({
      scheduledScenes: [...state.scheduledScenes, scheduledScene],
    })),

  updateScheduledScene: (id, updatedScheduledScene) =>
    set((state) => ({
      scheduledScenes: state.scheduledScenes.map((scheduledScene) =>
        scheduledScene.id === id
          ? { ...scheduledScene, ...updatedScheduledScene }
          : scheduledScene,
      ),
    })),

  deleteScheduledScene: (id) =>
    set((state) => ({
      scheduledScenes: state.scheduledScenes.filter(
        (scheduledScene) => scheduledScene.id !== id,
      ),
    })),

  toggleScheduledScene: (id) =>
    set((state) => ({
      scheduledScenes: state.scheduledScenes.map((scheduledScene) =>
        scheduledScene.id === id
          ? { ...scheduledScene, isEnabled: !scheduledScene.isEnabled }
          : scheduledScene,
      ),
    })),
}));
