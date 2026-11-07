import { createRoot } from 'react-dom/client';
import { HashbrownProvider } from '@hashbrownai/react';
import { App } from './app';
import '../../shared/styles.css';
const root = document.getElementById('root');
if (!root) throw Error('Starter root missing.');
createRoot(root).render(
  <HashbrownProvider url="/run">
    <App />
  </HashbrownProvider>,
);
