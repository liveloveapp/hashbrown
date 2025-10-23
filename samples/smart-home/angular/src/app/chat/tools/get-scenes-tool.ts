import { inject } from '@angular/core';
import { createTool } from '@hashbrownai/angular';
import { SmartHome } from '../../smart-home';

export const getScenesTool = createTool({
  name: 'getScenes',
  description: 'Get the current scenes',
  handler: () => {
    const smartHome = inject(SmartHome);

    return smartHome.fetchScenes();
  },
});
