import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-confirm',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  template: `
    <h1 mat-dialog-title>Confirm</h1>
    <div mat-dialog-content>
      <p>{{ data.message }}</p>
    </div>
    <div mat-dialog-actions>
      <button mat-button (click)="onConfirm()">Confirm</button>
      <button mat-button (click)="onCancel()">Cancel</button>
    </div>
  `,
})
export class ConfirmComponent {
  protected dialogRef = inject(MatDialogRef<ConfirmComponent>);
  protected data = inject<{ title: string; message: string }>(MAT_DIALOG_DATA);

  protected onConfirm() {
    this.dialogRef.close(true);
  }

  protected onCancel() {
    this.dialogRef.close(false);
  }
}
