import { Injectable } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

@Injectable({
  providedIn: 'root',
})
export class FirebaseService {
  app?: FirebaseApp;

  getApp() {
    if (!this.app) {
      this.app = initializeApp(config);
    }
    return this.app;
  }
}
