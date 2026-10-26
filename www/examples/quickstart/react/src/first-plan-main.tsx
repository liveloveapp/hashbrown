import { createRoot } from 'react-dom/client';
import { HashbrownProvider } from '@hashbrownai/react';
import { FirstPlanApp } from './FirstPlanApp';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <HashbrownProvider url="/api/chat">
    <FirstPlanApp />
  </HashbrownProvider>,
);
