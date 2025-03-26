import { Injectable } from '@angular/core';
import { of } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  getCurrentUser() {
    return of({
      id: '123',
      firstName: 'Mike',
      lastName: 'Ryan',
      email: 'mike@ryan.com',
    });
  }
}
