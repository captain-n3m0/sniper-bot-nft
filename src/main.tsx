import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {reportClientError} from './dev-error-reporter';

createRoot(document.getElementById('root')!, {
  onCaughtError: (error, errorInfo) => {
    reportClientError('react-caught', error, { componentStack: errorInfo.componentStack });
  },
  onUncaughtError: (error, errorInfo) => {
    reportClientError('react-uncaught', error, { componentStack: errorInfo.componentStack });
  },
  onRecoverableError: (error, errorInfo) => {
    reportClientError('react-recoverable', error, { componentStack: errorInfo.componentStack });
  },
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
