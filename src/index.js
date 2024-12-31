// src/index.js

import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import NotesViewer from './NotesViewer';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

ReactDOM.render(
 <React.StrictMode>
   <NotesViewer />
 </React.StrictMode>,
 document.getElementById('root')
);

// Register the service worker
