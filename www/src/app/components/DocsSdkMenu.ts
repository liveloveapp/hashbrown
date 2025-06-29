import { Component, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Angular } from '../icons/Angular';
import { React } from '../icons/React';
import { DropdownMenu } from './DropDownMenu';
import { ConfigService } from '../services/ConfigService';

@Component({
  selector: 'www-docs-sdk-menu',
  imports: [DropdownMenu, Angular, React, RouterLink],
  template: `
    <www-dropdown-menu [placement]="['right', 'bottom']">
      @switch (sdk()) {
        @case ('angular') {
          <label>
            <www-angular height="16px" width="16px" fill="#774625" />
            Angular
          </label>
        }
        @case ('react') {
          <label>
            <www-react height="16px" width="16px" fill="#774625" />
            React
          </label>
        }
      }
      <div content class="content">
        <a routerLink="/docs/angular/start/quick" (click)="close()">
          <www-angular fill="#774625" />
          Angular
        </a>
        <a routerLink="/docs/react/start/quick" (click)="close()">
          <www-react fill="#774625" />
          React
        </a>
      </div>
    </www-dropdown-menu>
  `,
  styles: `
    :host {
      display: flex;
      justify-content: flex-end;
      padding: 16px 32px;
    }

    www-dropdown-menu {
      label {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .content {
        > a {
          padding: 16px;
          display: flex;
          gap: 8px;
          align-items: center;
        }
      }
    }
  `,
})
export class DocsSdkMenu {
  configService = inject(ConfigService);
  sdk = this.configService.sdk;
  dropdownMenu = viewChild.required(DropdownMenu);

  close() {
    this.dropdownMenu().toggle();
  }
}
