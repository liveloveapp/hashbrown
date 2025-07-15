import { useCallback } from 'react';
import { useTool } from '@hashbrownai/react';
import { useSmartHomeStore } from '../store/smart-home.store';

export const useGetLightsTool = () => {
  const lightsHandler = useCallback(() => {
    return Promise.resolve(useSmartHomeStore.getState().lights);
  }, []);
  const getLights = useTool({
    name: 'getLights',
    description: 'Get the current lights',
    handler: lightsHandler,
  });

  return getLights;
};
