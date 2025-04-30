import { useEffect } from 'react';
import {
  sampleLights,
  sampleScenes,
  sampleScheduledScenes,
} from '../data/sample-data';
import { useSmartHomeStore } from '../store/smart-home.store';

export function StoreInitializer() {
  const addLight = useSmartHomeStore((state) => state.addLight);
  const addScene = useSmartHomeStore((state) => state.addScene);
  const addScheduledScene = useSmartHomeStore(
    (state) => state.addScheduledScene,
  );
  const lights = useSmartHomeStore((state) => state.lights);
  const scenes = useSmartHomeStore((state) => state.scenes);
  const scheduledScenes = useSmartHomeStore((state) => state.scheduledScenes);

  if (lights.length === 0) {
    sampleLights.forEach((light) => addLight(light));
  }

  if (scenes.length === 0) {
    sampleScenes.forEach((scene) => addScene(scene));
  }

  if (scheduledScenes.length === 0) {
    sampleScheduledScenes.forEach((scheduledScene) =>
      addScheduledScene(scheduledScene),
    );
  }

  return null; // This component doesn't render anything
}
