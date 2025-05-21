import { HashbrownProvider } from '@hashbrownai/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashbrownProvider url="http://localhost:3000/chat">
      <App />
    </HashbrownProvider>
  </StrictMode>,
);
