/* eslint-disable @nx/enforce-module-boundaries -- the stylesheet is shared with the Angular app, so it is imported by relative path */
import 'leaflet/dist/leaflet.css';
import '../../shared/src/styles/atc.css';
import { createAtcStore } from '@atc/shared';
import { HashbrownProvider } from '@hashbrownai/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { AtcStoreProvider } from './store';

const store = createAtcStore();
const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root');
}

createRoot(root).render(
  <StrictMode>
    <HashbrownProvider url="/api/run">
      <AtcStoreProvider store={store}>
        <App />
      </AtcStoreProvider>
    </HashbrownProvider>
  </StrictMode>,
);
