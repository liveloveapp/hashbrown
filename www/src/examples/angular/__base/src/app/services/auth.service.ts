import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  getUser() {
    return Promise.resolve({
      name: 'Brian Love',
      email: 'brian@liveloveapp.com',
    });
  }
}
