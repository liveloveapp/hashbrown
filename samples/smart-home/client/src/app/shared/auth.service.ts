import { Injectable } from '@angular/core';
import { of } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  getUser() {
    return of({
      name: 'Mike Ryan',
      email: 'mike@liveloveapp.com',
    });
  }
}
