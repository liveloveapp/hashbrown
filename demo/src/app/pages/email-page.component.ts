import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PredictiveTextareaComponent } from '../components/predictive-textarea.component';
import { predictTextResource } from '@cassini/core';

@Component({
  selector: 'app-email-page',
  standalone: true,
  imports: [CommonModule, PredictiveTextareaComponent],
  template: `
    <div class="email-page">
      <h1>Email Composer with AI Suggestions</h1>

      <div class="form-group">
        <label for="email-subject">Subject:</label>
        <input type="text" id="email-subject" class="form-control" />
      </div>

      <div class="form-group">
        <label for="email-body">Email Body:</label>
        <app-predictive-textarea
          [value]="emailContent()"
          [prediction]="prediction()"
          (valueChange)="updateEmailContent($event)"
        ></app-predictive-textarea>
      </div>

      <div class="actions">
        <button class="btn btn-primary">Send Email</button>
        <button class="btn btn-secondary">Save Draft</button>
      </div>

      <div class="prediction-status" *ngIf="isLoading()">
        Generating suggestions...
      </div>
    </div>
  `,
  styles: `
    .email-page {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    
    .form-group {
      margin-bottom: 20px;
    }
    
    label {
      display: block;
      margin-bottom: 5px;
      font-weight: bold;
    }
    
    .form-control {
      width: 100%;
      padding: 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
    }
    
    .actions {
      margin-top: 20px;
    }
    
    .btn {
      padding: 8px 16px;
      margin-right: 10px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    
    .btn-primary {
      background-color: #007bff;
      color: white;
    }
    
    .btn-secondary {
      background-color: #6c757d;
      color: white;
    }
    
    .prediction-status {
      margin-top: 10px;
      font-style: italic;
      color: #666;
    }
  `,
})
export class EmailPageComponent {
  emailContent = signal('');

  predictiveText = predictTextResource({
    input: this.emailContent,
    description:
      'Predict the next few words in an email based on what the user has typed so far.',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    examples: [
      {
        input: 'Hello, I wanted to follow up on our',
        output:
          ' meeting yesterday. Could we schedule some time to discuss the next steps?',
      },
      {
        input: 'Thank you for your',
        output: ' prompt response. I appreciate your attention to this matter.',
      },
      {
        input: 'I hope this email finds you',
        output:
          ' well. I am writing to inquire about the status of our project.',
      },
    ],
  });

  prediction = computed(() => this.predictiveText.output() || '');
  isLoading = computed(() => this.predictiveText.isPredicting());

  // Update the email content when the user types
  updateEmailContent(newContent: string) {
    console.log('updateEmailContent', newContent);
    this.emailContent.set(newContent);
  }
}
