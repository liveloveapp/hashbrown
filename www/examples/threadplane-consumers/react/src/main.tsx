import { createRoot } from 'react-dom/client';
import { HashbrownProvider } from '@hashbrownai/react';
import '@threadplane/react/chat/styles.css';
import { ThreadplaneChat } from './ThreadplaneChat';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <HashbrownProvider url="/api/chat">
    <ThreadplaneChat />
  </HashbrownProvider>,
);
