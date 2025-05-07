import { Component, computed, input } from '@angular/core';
import { BrandGitHub } from '../icons/BrandGitHub';

@Component({
  selector: 'www-symbol-code-link',
  imports: [BrandGitHub],
  template: `
    <a [href]="url()" target="_blank">
      <www-brand-github />
    </a>
  `,
})
export class SymbolCodeLink {
  fileUrlPath = input.required<string>();
  url = computed(() => {
    console.log(this.fileUrlPath());
    const [, fileName] = this.fileUrlPath().split('dist/');
    if (!fileName) {
      return '';
    }
    const actualFileName = fileName.replace('.d.ts', '.ts');

    return `https://github.com/liveloveapp/hashbrown/blob/main/${actualFileName}`;
  });
}
