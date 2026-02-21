import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { FrontContextProvider } from './providers/frontContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FrontContextProvider>
      <App />
    </FrontContextProvider>
  </React.StrictMode>
);
