import { Injectable } from '@angular/core';
import sdk from '@stackblitz/sdk';
import type { StackblitzConfig } from '../../tools/stackblitz-plugin';

const EXAMPLE_FILES = import.meta.glob('../examples/**/stackblitz.yml', {
  import: 'default',
});

@Injectable({ providedIn: 'root' })
export class ExamplesService {
  async getConfig(exampleName: string): Promise<StackblitzConfig> {
    return (await EXAMPLE_FILES[
      `../examples/${exampleName}/stackblitz.yml`
    ]()) as StackblitzConfig;
  }

  async load(element: HTMLElement, exampleName: string) {
    const config = await this.getConfig(exampleName);

    return sdk.embedProject(
      element,
      {
        title: config.name,
        description: config.description,
        template: 'node',
        files: {
          ...config.files,
        },
      },
      {
        clickToLoad: false,
        openFile: config.open,
        showSidebar: false,
      },
    );
  }
}
