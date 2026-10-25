import { bootstrapApplication } from '@angular/platform-browser';
import { ThreadplaneChat } from './app/threadplane-chat';

bootstrapApplication(ThreadplaneChat).catch((error: unknown) => {
  console.error(error);
});
