import {
  AfterViewInit,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
} from '@angular/core';

@Component({
  selector: 'app-code-loader',
  template: `
    @for (line of lines(); track $index) {
      <div class="line" [style.width.ch]="line / 2"></div>
    }
  `,
  styles: `
    :host {
      width: 240px;
      height: 200px;
      background-color: #fff;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow: hidden;
      scroll-behavior: smooth;
      border-radius: 4px;
      opacity: 0.12;
    }

    @keyframes slideIn {
      from {
        transform: translateY(8px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    .line {
      height: 4px;
      max-width: 100%;
      border-radius: 4px;
      animation: slideIn 0.3s ease-out forwards;
      transition: width 0.3s ease-out;
      flex-shrink: 0;
    }

    .line:nth-child(4n) {
      background-color: #9ecfd7;
    }

    .line:nth-child(4n + 1) {
      background-color: #b76060;
    }

    .line:nth-child(4n + 2) {
      background-color: #e88c4d;
    }

    .line:nth-child(4n + 3) {
      background-color: #fbbb52;
    }
  `,
})
export class CodeLoader implements AfterViewInit {
  host = inject(ElementRef);
  code = input.required<string>();
  lines = computed(() => {
    return this.code()
      .split('\n')
      .map((line) => line.length);
  });

  constructor() {
    // Re‑scroll whenever the line list changes.
    effect(() => {
      this.lines();
      queueMicrotask(() => this.scrollToBottom());
    });
  }

  ngAfterViewInit() {
    this.scrollToBottom();
  }

  private scrollToBottom() {
    const el = this.host.nativeElement;
    el.scrollTop = el.scrollHeight;
  }
}
