import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
