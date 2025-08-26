import { Component, effect, inject, Signal, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { codeToHtml } from 'shiki';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-code-modal',
  imports: [MatDialogModule],
  template: `
    <mat-dialog-content>
      <div [innerHTML]="html()" class="code-modal-content"></div>
    </mat-dialog-content>
  `,
  styles: `
    mat-dialog-content {
      padding: 16px;
      background-color: #1f1f1f;
      overflow: auto;
      width: 80vw;
      max-width: 1000px;
    }

    .code-modal-content {
      font-size: 13px;
      line-height: 1.5;
      font-family: 'Roboto Mono', monospace;
    }
  `,
})
export class CodeModalComponent {
  matData: { code: Signal<string> } = inject(MAT_DIALOG_DATA);
  sanitizer = inject(DomSanitizer);
  html = signal<SafeHtml | null>(null);

  constructor() {
    effect(() => {
      const code = this.matData.code();
      if (!code) return;

      codeToHtml(code, {
        lang: 'javascript',
        theme: 'min-dark',
      }).then((result) =>
        this.html.set(this.sanitizer.bypassSecurityTrustHtml(result)),
      );
    });
  }
}
