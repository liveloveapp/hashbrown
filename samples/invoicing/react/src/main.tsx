import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, createSnapshotLoader } from './App';
import '@pretable/ui/themes/pretable.css';
import '@pretable/ui/grid.css';
import './styles.css';

const loadSnapshot = createSnapshotLoader();
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <App loadSnapshot={loadSnapshot} />
  </StrictMode>,
);
