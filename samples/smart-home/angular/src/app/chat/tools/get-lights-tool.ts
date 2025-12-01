import { inject } from '@angular/core';
import { createTool } from '@hashbrownai/angular';
import { SmartHome } from '../../smart-home';

export const getLightsTools = createTool({
  name: 'getLights',
  description: 'Get the current lights',
  handler: () => {
    const smartHome = inject(SmartHome);

    return smartHome.fetchLights();
  },
});
