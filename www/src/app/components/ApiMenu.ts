import { Component, inject } from '@angular/core';
import { ReferenceService } from '../services/ReferenceService';
import { PageSection } from './PageSection';

@Component({
  selector: 'www-ref-menu',
  imports: [PageSection],
  template: `
    <www-page-section
      [section]="referenceService.getSection()"
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
      overflow-x: auto;
    }
  `,
})
export class ApiMenu {
  referenceService = inject(ReferenceService);
}
