import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Chart as ChartJS } from 'chart.js/auto';
import { Chat } from './Chat';
import { MatButtonModule } from '@angular/material/button';
import { RenderMessageComponent } from '@hashbrownai/angular';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { CodeModal } from './CodeModal';
import { CodeLoader } from './CodeLoader';

ChartJS.defaults.color = '#ffffff';
ChartJS.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';
ChartJS.defaults.backgroundColor = 'rgba(255, 255, 255, 0.1)';

@Component({
  selector: 'app-chart-page',
  imports: [
    MatButtonModule,
    RenderMessageComponent,
    MatProgressBarModule,
    MatDialogModule,
    CodeLoader,
  ],
  template: `
    <div class="header">
      <input
        type="text"
        #input
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        (keyup.enter)="sendMessage()"
      />
      <button matButton="tonal" (click)="sendMessage()" [disabled]="disabled()">
        @if (chat.lastAssistantMessage()) {
          Remix
        } @else {
          Create
        }
      </button>
    </div>
    <div class="loaderArea">
      @if (chat.isLoading()) {
        <mat-progress-bar mode="indeterminate" />
      }
    </div>
    <div class="chartArea">
      @if (chat.code() && !hasRenderedAChart()) {
        <app-code-loader [code]="chat.code()!" />
      }
      <canvas #canvasRef></canvas>
    </div>
    <div class="toastArea">
      @let lastAssistantMessage = chat.lastAssistantMessage();
      @if (lastAssistantMessage) {
        <hb-render-message [message]="lastAssistantMessage" />
      }
    </div>
    @if (chat.code()) {
      <button class="open-code-modal" (click)="openCodeModal()">Code</button>
    }
  `,
  styles: `
    :host {
      display: grid;
      width: 100vw;
      height: 100vh;
      max-height: 100vh;
      grid-template-rows: 64px 4px 1fr;
      color: #ffffff;
      background-color: #1e1e1e;
    }

    .header {
      display: flex;
      gap: 16px;
      padding: 16px;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      border-bottom: 1px solid #333333;
      background-color: #1e1e1e;
    }

    input {
      width: 100%;
      height: 100%;
      border: none;
      outline: none;
      padding: 16px;
      border-radius: 8px;
      background-color: #2c2c2c;
      color: #ffffff;
      font-size: 16px;
    }

    input:disabled {
      opacity: 0.5;
    }

    .chartArea {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: calc(100vh - 64px);
      padding: 24px;
      position: relative;
    }

    app-code-loader {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }

    canvas {
      transition: opacity 0.3s ease;
    }

    canvas.rendering {
      opacity: 0;
    }

    .toastArea {
      position: fixed;
      bottom: 16px;
      left: 16px;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: flex-end;
      gap: 16px;
    }

    button.open-code-modal {
      position: fixed;
      right: 4px;
      bottom: 4px;
      opacity: 0.2;
      transition: opacity 0.3s ease;
    }

    button.open-code-modal:hover {
      opacity: 1;
    }
  `,
})
export class ChartPage {
  chat = inject(Chat);
  dialog = inject(MatDialog);
  canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvasRef');
  inputRef = viewChild.required<ElementRef<HTMLInputElement>>('input');
  disabled = computed(() => this.chat.isLoading());
  placeholder = computed(() => {
    if (this.chat.lastAssistantMessage()) {
      return 'What do you want to change?';
    }

    return 'What chart do you want to create?';
  });
  hasRenderedAChart = signal(false);
  constructor() {
    effect(async (onCleanup) => {
      const canvas = this.canvasRef().nativeElement;
      const chartConfig = this.chat.chart();
      const chartOptions = this.chat.options();

      canvas.classList.add('rendering');

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, 300);

        onCleanup(() => {
          clearTimeout(timeout);
          reject(new Error('Rendering cancelled'));
        });
      });

      if (chartConfig && chartOptions) {
        const chart = new ChartJS(canvas, {
          ...chartConfig,
          options: {
            responsive: true,
            maintainAspectRatio: true,
            ...chartOptions,
          },
        });

        this.hasRenderedAChart.set(true);

        onCleanup(() => {
          chart.destroy();
        });
      }

      canvas.classList.remove('rendering');
    });

    effect(() => {
      if (!this.chat.isLoading()) {
        this.inputRef().nativeElement.focus();
        this.inputRef().nativeElement.value = '';
      }
    });
  }

  sendMessage() {
    this.chat.sendMessage(this.inputRef().nativeElement.value);
  }

  openCodeModal() {
    const code = this.chat.code();

    if (code) {
      this.dialog.open(CodeModal, {
        data: code,
      });
    }
  }
}
