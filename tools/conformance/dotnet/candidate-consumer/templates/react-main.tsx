import { createRoot } from 'react-dom/client';
import { HashbrownProvider } from '@hashbrownai/react';
import { App } from './app';
import { CandidateErrorBoundary } from './react/panel';

const element = document.getElementById('root');
if (!element) throw Error('Candidate root missing');
createRoot(element).render(
  <HashbrownProvider url="/run">
    <CandidateErrorBoundary>
      <App />
    </CandidateErrorBoundary>
  </HashbrownProvider>,
);
