import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import NotesViewer from './NotesViewer';
import { AuthProvider } from './contexts/AuthContext';
// import * as serviceWorkerRegistration from './serviceWorkerRegistration'; // Adjust path as necessary

ReactDOM.render(
  <React.StrictMode>
    <AuthProvider>
      <NotesViewer />
    </AuthProvider>
  </React.StrictMode>,
  document.getElementById('root')
);

// Register the service worker
// serviceWorkerRegistration.register();