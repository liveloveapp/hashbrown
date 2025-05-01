import { Component, inject } from '@angular/core';
import { MenuService } from '../services/MenuService';
import { PageSection } from './PageSection';

@Component({
  selector: 'www-ref-menu',
  imports: [PageSection],
  template: `
    <www-page-section
      [section]="refs()"
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
      border-right: 1px solid rgba(47, 47, 43, 0.24);
      overflow-x: auto;
    }
  `,
})
export class ApiMenu {
  refs = inject(MenuService).refs;
}
