import { Component, computed, input } from '@angular/core';
import { Code } from '../icons/Code';

@Component({
  selector: 'www-symbol-code-link',
  imports: [Code],
  template: `
    <a [href]="url()" target="_blank">
      <www-code />
    </a>
  `,
})
export class SymbolCodeLink {
  fileUrlPath = input.required<string>();
  url = computed(() => {
    const [, fileName] = this.fileUrlPath().split('dist/');
    if (!fileName) {
      return '';
    }
    const actualFileName = fileName.replace('.d.ts', '.ts');

    return `https://github.com/liveloveapp/hashbrown/blob/main/${actualFileName}`;
  });
}
