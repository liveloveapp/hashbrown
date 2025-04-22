import { Injectable } from '@angular/core';
import { of } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  getUser() {
    return of({
      name: 'Brian Love',
      email: 'brian@liveloveapp.com',
    });
  }
}
