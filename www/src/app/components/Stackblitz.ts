import { isPlatformServer } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  input,
  PLATFORM_ID,
  viewChild,
} from '@angular/core';
import { ExamplesService } from '../services/ExamplesService';

@Component({
  selector: 'www-stackblitz',
  template: `<div #example></div>`,
  styles: `
    :host {
      flex: 1 auto;
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }

    :host ::ng-deep iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: none;
    }
  `,
})
export class Stackblitz implements AfterViewInit {
  examplesService = inject(ExamplesService);
  platformId = inject(PLATFORM_ID);
  name = input<string>('__base');
  exampleRef = viewChild.required<ElementRef<HTMLDivElement>>('example');

  ngAfterViewInit(): void {
    if (isPlatformServer(this.platformId)) return;
    this.examplesService.load(this.exampleRef().nativeElement, this.name());
  }
}
