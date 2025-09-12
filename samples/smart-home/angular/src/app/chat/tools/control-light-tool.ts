import { inject } from '@angular/core';
import { createTool } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { SmartHome } from '../../smart-home';

export const controlLightTool = createTool({
  name: 'controlLight',
  description: 'Control a light',
  schema: s.object('Control light input', {
    lightId: s.string('The id of the light'),
    brightness: s.number('The brightness of the light'),
  }),
  handler: (input) => {
    const smartHome = inject(SmartHome);

    return smartHome.controlLight(input.lightId, input.brightness);
  },
});
