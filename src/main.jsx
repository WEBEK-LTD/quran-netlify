import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import './styles/fonts.css'
import './styles/theme.css'
import { initAppearance } from './appearance'
import { isNative } from './native/platform'
import { installMediaShim } from './native/mediaShim'

initAppearance();

// Native app (Capacitor): media-controls shim must be in place before the audio
// code attaches to navigator.mediaSession; the rest loads lazily (not on the website).
if (isNative()) {
  installMediaShim();
  import('./native/index.js').then(m => m.initNative()).catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
