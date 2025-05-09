import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  getUser() {
    return Promise.resolve({
      name: 'Mike Ryan',
      email: 'mike@liveloveapp.com',
    });
  }
}
