import { NgClass } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { NavigationList } from './NavigationList';
import { Section } from '../models/menu.models';
import { ApiService } from '../services/ApiService';

@Component({
  selector: 'www-api-menu',
  imports: [NgClass, NavigationList],
  template: `
    <div class="window" [ngClass]="'level-' + level()">
      <www-navigation-list
        [sections]="sections()"
        [level]="level()"
        (change)="onChange($event)"
      />
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: 16px 0;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .window {
      transition: transform 0.2s ease-in-out;
    }

    .window.level-1 {
      transform: translateX(-100%);
    }

    @media screen and (min-width: 768px) {
      .window.level-1 {
        transform: translateX(-196px);
      }
    }

    @media screen and (min-width: 1024px) {
      .window.level-1 {
        transform: translateX(-256px);
      }
    }

    @media screen and (min-width: 1281px) {
      .window.level-1 {
        transform: translateX(-320px);
      }
    }
  `,
})
export class ApiMenu {
  apiService = inject(ApiService);

  level = signal(0);
  sections = signal<Section[]>(this.apiService.getSections());

  onChange(section: Section) {
    if (section.active) {
      this.level.set(this.level() - 1);
    } else {
      this.level.set(this.level() + 1);
    }
    this.sections.update((value) => {
      return value.map((item) => ({
        ...item,
        active: item.title === section.title ? !item.active : item.active,
      }));
    });
  }
}
