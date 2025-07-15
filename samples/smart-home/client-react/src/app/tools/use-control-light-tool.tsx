import { useCallback } from 'react';
import { s } from '@hashbrownai/core';
import { useTool } from '@hashbrownai/react';
import { useSmartHomeStore } from '../store/smart-home.store';

export const useControlLightTool = () => {
  const controlLightHandler = useCallback(
    (input: { lightId: string; brightness: number }) => {
      useSmartHomeStore.getState().updateLight(input.lightId, {
        brightness: input.brightness,
      });
      return Promise.resolve(true);
    },
    [],
  );
  const controlLight = useTool({
    name: 'controlLight',
    description: 'Control the light. Brightness is a number between 0 and 100.',
    schema: s.object('Control light input', {
      lightId: s.string('The id of the light'),
      brightness: s.number('The brightness of the light, between 0 and 100'),
    }),
    handler: controlLightHandler,
  });

  return controlLight;
};
