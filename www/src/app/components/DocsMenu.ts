import { Component, inject } from '@angular/core';
import { MenuService } from '../services/MenuService';
import { PageSection } from './PageSection';

@Component({
  selector: 'www-docs-menu',
  imports: [PageSection],
  template: `
    <www-page-section
      [section]="docs()"
      [collapsible]="false"
    ></www-page-section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 24px;
      height: 100%;
      padding: 32px;
      border-right: 1px solid rgba(61, 60, 58, 0.24);
    }
  `,
})
export class DocsMenu {
  docs = inject(MenuService).docs;
}
