// Must stay the first import: native media-controls shim (no-op on the website)
import './native/boot.js'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import './styles/fonts.css'
import './styles/theme.css'
import { initAppearance } from './appearance'
import { isNative } from './native/platform'

initAppearance();

// Native app (Capacitor): adhan, deep links, system bars, push… loaded lazily so
// the website never downloads them.
if (isNative()) {
  import('./native/index.js').then(m => m.initNative()).catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
