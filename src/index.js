import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import NotesViewer from './NotesViewer';
// import * as serviceWorkerRegistration from './serviceWorkerRegistration'; // Adjust path as necessary

ReactDOM.render(
  <React.StrictMode>
    <NotesViewer />
  </React.StrictMode>,
  document.getElementById('root')
);

// Register the service worker
// serviceWorkerRegistration.register();