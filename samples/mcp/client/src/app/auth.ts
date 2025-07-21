import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-auth',
  template: ` <div>Auth</div> `,
})
export class AuthComponent {
  constructor(private route: ActivatedRoute) {
    this.route.queryParams.subscribe((params) => {
      console.log(params);
    });
  }
}
