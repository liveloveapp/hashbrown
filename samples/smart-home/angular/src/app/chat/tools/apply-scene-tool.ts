import { inject } from '@angular/core';
import { s } from '@hashbrownai/core';
import { createTool } from '@hashbrownai/angular';
import { SmartHome } from '../../smart-home';
import { z } from 'zod';

export const applySceneTool = createTool({
  name: 'applyScene',
  description: 'Applies a scene',
  schema: s.object('Apply Scene Input', {
    sceneId: s.string('The id of the scene'),
  }),
  handler: (input) => {
    const smartHome = inject(SmartHome);
    return smartHome.applyScene(input.sceneId);
  },
});
