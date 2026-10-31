import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './hosted/nativeBridge'
import { RemoteScreensaver } from './display/RemoteScreensaver'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <RemoteScreensaver />
  </StrictMode>,
)
