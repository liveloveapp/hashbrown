import { Route } from '@angular/router';
import { ChatPageComponent } from './pages/chat-page.component';
import { ShoppingListComponent } from './pages/shopping-list.component';
import { EmailPageComponent } from './pages/email-page.component';

export const appRoutes: Route[] = [
  { path: '', component: ChatPageComponent },
  { path: 'shopping-list', component: ShoppingListComponent },
  { path: 'email', component: EmailPageComponent },
];
