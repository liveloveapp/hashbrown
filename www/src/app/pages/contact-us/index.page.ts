import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { addDoc, collection, getFirestore } from 'firebase/firestore';
import { Header } from '../../components/Header';
import { BrandLiveLoveApp } from '../../icons/BrandLiveLoveApp';
import { Footer } from '../../components/Footer';
import { FirebaseService } from '../../services/FirebaseService';

const STATUS = {
  IN_PROGRESS: 0,
  NOT_SUBMITTED: 1,
  SUCCESS: 2,
  ERROR: 3,
};

@Component({
  imports: [ReactiveFormsModule, Header, BrandLiveLoveApp, Footer],
  template: `
    <www-header />
    <div class="bleed">
      <div class="about">
        <h1>Talk to our team</h1>
        <p>
          We're a team of engineers, designers, and developers who are
          passionate about building the next generation of web applications -
          and we work at a software consultancy called LiveLoveApp.
        </p>
        <p>
          Work with LiveLoveApp to accelerate the intelligence of your web
          application using hashbrown.
        </p>
        <www-brand-liveloveapp />
      </div>
      <div class="contact-us">
        @if (status() === STATUS.SUCCESS) {
          <p class="success">
            Thank you for your message! We will get back to you soon.
          </p>
        } @else {
          <form [formGroup]="form" (ngSubmit)="handleSubmit()" novalidate>
            <div>
              <label for="name">Full Name</label>
              <input id="name" type="text" formControlName="name" required />
              @if (form.get('name')?.invalid && form.get('name')?.touched) {
                <p class="error">Please enter your full name.</p>
              }
            </div>
            <div>
              <label for="email">Company Email</label>
              <input id="email" type="email" formControlName="email" required />
              @if (form.get('email')?.invalid && form.get('email')?.touched) {
                @if (form.get('email')?.errors?.['required']) {
                  <p class="error">Email is required.</p>
                } @else {
                  <p class="error">Enter a valid email address.</p>
                }
              }
            </div>
            <div>
              <label for="message">How can we help?</label>
              <textarea
                id="message"
                rows="5"
                formControlName="message"
              ></textarea>
            </div>
            <button
              type="submit"
              [disabled]="status() === STATUS.IN_PROGRESS || form.invalid"
            >
              {{
                status() === STATUS.IN_PROGRESS ? 'Sending...' : 'Send Message'
              }}
            </button>
          </form>
        }
      </div>
    </div>
    <www-footer />
  `,
  styles: `
    :host {
      flex: 1 auto;
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .bleed {
      align-self: center;
      padding: 32px;
      display: grid;
      grid-template-columns: 1fr;
      gap: 32px;
      width: 100%;
      max-width: 1024px;

      > .about {
        padding: 32px;
        display: flex;
        flex-direction: column;
        gap: 32px;
        border-right: 1px solid rgba(47, 47, 43, 0.24);

        > h1 {
          display: flex;
          flex-direction: column;
          color: var(--gray-dark, #3d3c3a);
          transition: color 0.2s ease-in-out;
          font:
            400 24px/32px 'KefirVariable',
            sans-serif;
          font-variation-settings: 'wght' 400;
        }

        > p {
          color: #774625;
          font:
            500 16px/24px Poppins,
            sans-serif;
        }

        > div {
          display: flex;
          flex-direction: column;
          gap: 16px;

          > h2 {
            color: #5e5c5a;
            font:
              400 24px/32px Fredoka,
              sans-serif;
          }

          > p {
            font:
              400 14px/18px Poppins,
              sans-serif;
          }
        }
      }

      > .contact-us {
        > form {
          padding: 32px;
          display: flex;
          flex-direction: column;
          gap: 32px;

          > div {
            display: flex;
            flex-direction: column;
            gap: 8px;

            > label {
              color: #5e5c5a;
              font:
                400 16px/24px Poppins,
                sans-serif;
            }

            > input,
            > textarea {
              padding: 8px;
              border-radius: 8px;
              border: 1px solid rgba(47, 47, 43, 0.24);
              font:
                400 16px/24px Poppins,
                sans-serif;
            }

            > .error {
              color: #e53e3e;
              font-size: 0.875rem;
              margin-top: 0.25rem;
            }
          }

          > button {
            align-self: flex-end;
            display: flex;
            justify-content: center;
            align-items: center;
            color: rgba(47, 47, 43, 0.88);
            font:
              500 18px/24px 'Fredoka',
              sans-serif;
            padding: 12px 24px;
            border-radius: 48px;
            border: 6px solid #d8ecef;
            background: #9ecfd7;
            transition:
              color 0.2s ease-in-out,
              border 0.2s ease-in-out;

            &:hover {
              color: #5e5c5a;
            }
          }
        }
      }
    }

    @media screen and (min-width: 1024px) {
      .bleed {
        grid-template-columns: 1fr 1fr;

        > .about {
          border-right-color: rgba(47, 47, 43, 0.24);
        }
      }
    }
  `,
})
export default class ContactUsPage {
  firebaseService = inject(FirebaseService);
  formBuilder = inject(FormBuilder);
  form = this.formBuilder.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    message: [''],
  });
  status = signal(STATUS.NOT_SUBMITTED);

  async handleSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.status.set(STATUS.IN_PROGRESS);

    const data = {
      timestamp: Date.now(),
      ...this.form.value,
    };

    try {
      const app = this.firebaseService.getApp();
      const db = getFirestore(app);
      await addDoc(collection(db, 'contact-us'), data);
      this.status.set(STATUS.SUCCESS);
      this.form.reset();
    } catch (e: any) {
      console.error('Firestore error:', e);
    }
  }

  protected readonly STATUS = STATUS;
}
