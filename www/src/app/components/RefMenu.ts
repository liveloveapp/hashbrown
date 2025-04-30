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
      border-right: 1px solid #f4f4f41f;
    }
  `,
})
export class RefMenu {
  refs = inject(MenuService).refs;
}
